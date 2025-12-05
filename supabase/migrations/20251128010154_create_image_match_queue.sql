-- ============================================================
-- Image Match Queue Table
-- ============================================================
-- Tracks products that need canonical product matching or image assignment

CREATE TABLE IF NOT EXISTS image_match_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Product reference
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Product data for matching
  upc TEXT,
  product_name TEXT NOT NULL,
  category TEXT,
  manufacturer TEXT,
  
  -- Matching status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, matched, manual_review, completed, failed
  match_confidence DECIMAL(5,2), -- 0.00 to 100.00
  match_type TEXT, -- upc_exact, name_fuzzy, manual
  
  -- Suggested match
  suggested_canonical_id UUID REFERENCES canonical_products(id) ON DELETE SET NULL,
  
  -- Manual review data
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Processing metadata
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

-- Primary queue queries
CREATE INDEX IF NOT EXISTS idx_image_match_queue_status 
  ON image_match_queue(status, created_at);

-- User's queue
CREATE INDEX IF NOT EXISTS idx_image_match_queue_user 
  ON image_match_queue(user_id, status);

-- Product lookup
CREATE INDEX IF NOT EXISTS idx_image_match_queue_product 
  ON image_match_queue(product_id);

-- UPC matching
CREATE INDEX IF NOT EXISTS idx_image_match_queue_upc 
  ON image_match_queue(upc) 
  WHERE upc IS NOT NULL;

-- Manual review queue
CREATE INDEX IF NOT EXISTS idx_image_match_queue_review 
  ON image_match_queue(status, match_confidence) 
  WHERE status = 'manual_review';

-- Suggested matches
CREATE INDEX IF NOT EXISTS idx_image_match_queue_suggested 
  ON image_match_queue(suggested_canonical_id) 
  WHERE suggested_canonical_id IS NOT NULL;

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE image_match_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can view their own queue items
CREATE POLICY "Users can view own queue items"
  ON image_match_queue FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert queue items for their products
CREATE POLICY "Users can insert own queue items"
  ON image_match_queue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own queue items
CREATE POLICY "Users can update own queue items"
  ON image_match_queue FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own queue items
CREATE POLICY "Users can delete own queue items"
  ON image_match_queue FOR DELETE
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to queue"
  ON image_match_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Trigger for updated_at
-- ============================================================
CREATE TRIGGER update_image_match_queue_updated_at
  BEFORE UPDATE ON image_match_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Function: Auto-add Products to Match Queue
-- ============================================================
-- Automatically adds new products without canonical_product_id to the queue
CREATE OR REPLACE FUNCTION auto_queue_product_for_matching()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if product doesn't have canonical_product_id
  IF NEW.canonical_product_id IS NULL AND NEW.is_active = true THEN
    INSERT INTO image_match_queue (
      product_id,
      user_id,
      upc,
      product_name,
      category,
      manufacturer,
      status
    ) VALUES (
      NEW.id,
      NEW.user_id,
      NEW.upc,
      NEW.description,
      NEW.category_name,
      NEW.manufacturer_name,
      'pending'
    )
    ON CONFLICT (product_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add constraint to ensure one queue item per product
ALTER TABLE image_match_queue 
ADD CONSTRAINT image_match_queue_product_id_unique UNIQUE (product_id);

-- Trigger to auto-queue new products
CREATE TRIGGER auto_queue_new_products
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION auto_queue_product_for_matching();

-- ============================================================
-- Function: Process Match Queue Item
-- ============================================================
-- Attempts to find a canonical product match for a queue item
CREATE OR REPLACE FUNCTION process_match_queue_item(queue_item_id UUID)
RETURNS TABLE (
  matched BOOLEAN,
  canonical_id UUID,
  confidence DECIMAL(5,2),
  match_type TEXT
) AS $$
DECLARE
  v_upc TEXT;
  v_name TEXT;
  v_product_id UUID;
  v_canonical_id UUID;
  v_confidence DECIMAL(5,2);
  v_match_type TEXT;
  v_similarity DECIMAL(5,2);
BEGIN
  -- Get queue item details
  SELECT upc, product_name, product_id
  INTO v_upc, v_name, v_product_id
  FROM image_match_queue
  WHERE id = queue_item_id;
  
  -- Strategy 1: Exact UPC match
  IF v_upc IS NOT NULL AND v_upc != '' THEN
    SELECT cp.id INTO v_canonical_id
    FROM canonical_products cp
    WHERE cp.upc = v_upc
    LIMIT 1;
    
    IF v_canonical_id IS NOT NULL THEN
      v_confidence := 100.00;
      v_match_type := 'upc_exact';
      
      -- Update queue item
      UPDATE image_match_queue
      SET 
        status = 'matched',
        suggested_canonical_id = v_canonical_id,
        match_confidence = v_confidence,
        match_type = v_match_type,
        last_attempt_at = NOW(),
        attempts = attempts + 1
      WHERE id = queue_item_id;
      
      -- Link product to canonical
      UPDATE products
      SET canonical_product_id = v_canonical_id
      WHERE id = v_product_id;
      
      RETURN QUERY SELECT true, v_canonical_id, v_confidence, v_match_type;
      RETURN;
    END IF;
  END IF;
  
  -- Strategy 2: Fuzzy name match
  SELECT cp.id, similarity(cp.normalized_name, normalize_product_name(v_name)) * 100
  INTO v_canonical_id, v_similarity
  FROM canonical_products cp
  WHERE similarity(cp.normalized_name, normalize_product_name(v_name)) > 0.7
  ORDER BY similarity(cp.normalized_name, normalize_product_name(v_name)) DESC
  LIMIT 1;
  
  IF v_canonical_id IS NOT NULL THEN
    v_confidence := v_similarity;
    v_match_type := 'name_fuzzy';
    
    -- High confidence fuzzy match
    IF v_confidence >= 85.00 THEN
      UPDATE image_match_queue
      SET 
        status = 'matched',
        suggested_canonical_id = v_canonical_id,
        match_confidence = v_confidence,
        match_type = v_match_type,
        last_attempt_at = NOW(),
        attempts = attempts + 1
      WHERE id = queue_item_id;
      
      UPDATE products
      SET canonical_product_id = v_canonical_id
      WHERE id = v_product_id;
      
      RETURN QUERY SELECT true, v_canonical_id, v_confidence, v_match_type;
      RETURN;
    
    -- Medium confidence - needs review
    ELSIF v_confidence >= 70.00 THEN
      UPDATE image_match_queue
      SET 
        status = 'manual_review',
        suggested_canonical_id = v_canonical_id,
        match_confidence = v_confidence,
        match_type = v_match_type,
        last_attempt_at = NOW(),
        attempts = attempts + 1
      WHERE id = queue_item_id;
      
      RETURN QUERY SELECT false, v_canonical_id, v_confidence, v_match_type;
      RETURN;
    END IF;
  END IF;
  
  -- No match found - needs manual review
  UPDATE image_match_queue
  SET 
    status = 'manual_review',
    match_confidence = 0.00,
    last_attempt_at = NOW(),
    attempts = attempts + 1
  WHERE id = queue_item_id;
  
  RETURN QUERY SELECT false, NULL::UUID, 0.00::DECIMAL(5,2), 'none'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Comments for Documentation
-- ============================================================
COMMENT ON TABLE image_match_queue IS 'Queue for products needing canonical product matching and image assignment';
COMMENT ON COLUMN image_match_queue.status IS 'pending: awaiting processing, matched: auto-matched, manual_review: needs human review, completed: processed, failed: error';
COMMENT ON COLUMN image_match_queue.match_confidence IS 'Confidence score from 0.00 to 100.00 for suggested match';
COMMENT ON FUNCTION process_match_queue_item IS 'Attempts to find canonical product match using UPC and fuzzy name matching';







