-- ============================================================
-- E-Commerce Hero Image Processing Queue
-- ============================================================
-- Queue table for processing product images through OpenAI GPT Image 1.5
-- to create professional e-commerce hero shots with clean backgrounds
-- while preserving the exact product condition (scratches, dirt, wear)

CREATE TABLE IF NOT EXISTS ecommerce_hero_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product reference
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Source image reference (optional - can also use source_image_url directly)
  source_image_id UUID REFERENCES product_images(id) ON DELETE SET NULL,
  source_image_url TEXT NOT NULL,
  
  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Result URLs (from Cloudinary after processing)
  result_cloudinary_url TEXT,
  result_card_url TEXT,
  result_thumbnail_url TEXT,
  result_gallery_url TEXT,
  result_detail_url TEXT,
  result_public_id TEXT,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timing
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Audit
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Fast lookup of pending items for queue processing
CREATE INDEX IF NOT EXISTS idx_ecommerce_hero_queue_pending 
  ON ecommerce_hero_queue(status, created_at ASC) 
  WHERE status = 'pending';

-- Fast lookup of processing items (for timeout detection)
CREATE INDEX IF NOT EXISTS idx_ecommerce_hero_queue_processing 
  ON ecommerce_hero_queue(status, processing_started_at) 
  WHERE status = 'processing';

-- Lookup by product (for UI display)
CREATE INDEX IF NOT EXISTS idx_ecommerce_hero_queue_product 
  ON ecommerce_hero_queue(product_id, created_at DESC);

-- Lookup by creator (for user's queue view)
CREATE INDEX IF NOT EXISTS idx_ecommerce_hero_queue_created_by 
  ON ecommerce_hero_queue(created_by, created_at DESC);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE ecommerce_hero_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Authenticated users can view all queue items (admin feature)
CREATE POLICY "Authenticated users can view queue"
  ON ecommerce_hero_queue FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert queue items
CREATE POLICY "Authenticated users can insert queue items"
  ON ecommerce_hero_queue FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update their own queue items, or service role can update any
CREATE POLICY "Users can update own queue items"
  ON ecommerce_hero_queue FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR status = 'pending');

-- Service role can update any queue items (for processing)
CREATE POLICY "Service role can update any queue items"
  ON ecommerce_hero_queue FOR UPDATE
  TO service_role
  USING (true);

-- Users can delete their own pending queue items
CREATE POLICY "Users can delete own pending queue items"
  ON ecommerce_hero_queue FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND status = 'pending');

-- Service role can delete any queue items
CREATE POLICY "Service role can delete any queue items"
  ON ecommerce_hero_queue FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- Trigger for updated_at
-- ============================================================
CREATE TRIGGER update_ecommerce_hero_queue_updated_at
  BEFORE UPDATE ON ecommerce_hero_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Function: Get next batch of pending queue items
-- ============================================================
CREATE OR REPLACE FUNCTION get_pending_ecommerce_hero_items(batch_size INTEGER DEFAULT 5)
RETURNS SETOF ecommerce_hero_queue AS $$
BEGIN
  RETURN QUERY
  UPDATE ecommerce_hero_queue
  SET 
    status = 'processing',
    processing_started_at = NOW(),
    updated_at = NOW()
  WHERE id IN (
    SELECT id 
    FROM ecommerce_hero_queue 
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Mark queue item as completed
-- ============================================================
CREATE OR REPLACE FUNCTION complete_ecommerce_hero_item(
  p_queue_id UUID,
  p_cloudinary_url TEXT,
  p_card_url TEXT,
  p_thumbnail_url TEXT,
  p_gallery_url TEXT DEFAULT NULL,
  p_detail_url TEXT DEFAULT NULL,
  p_public_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE ecommerce_hero_queue
  SET 
    status = 'completed',
    result_cloudinary_url = p_cloudinary_url,
    result_card_url = p_card_url,
    result_thumbnail_url = p_thumbnail_url,
    result_gallery_url = p_gallery_url,
    result_detail_url = p_detail_url,
    result_public_id = p_public_id,
    processing_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Mark queue item as failed
-- ============================================================
CREATE OR REPLACE FUNCTION fail_ecommerce_hero_item(
  p_queue_id UUID,
  p_error_message TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE ecommerce_hero_queue
  SET 
    status = 'failed',
    error_message = p_error_message,
    retry_count = retry_count + 1,
    processing_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Reset stuck processing items (timeout after 5 mins)
-- ============================================================
CREATE OR REPLACE FUNCTION reset_stuck_ecommerce_hero_items()
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  WITH reset AS (
    UPDATE ecommerce_hero_queue
    SET 
      status = 'pending',
      processing_started_at = NULL,
      retry_count = retry_count + 1,
      updated_at = NOW()
    WHERE status = 'processing'
      AND processing_started_at < NOW() - INTERVAL '5 minutes'
      AND retry_count < 3
    RETURNING 1
  )
  SELECT COUNT(*) INTO reset_count FROM reset;
  
  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE ecommerce_hero_queue IS 'Queue for processing product images through OpenAI GPT Image 1.5 to create e-commerce hero shots';
COMMENT ON COLUMN ecommerce_hero_queue.source_image_url IS 'URL of the source image to transform (Cloudinary, Supabase Storage, or external)';
COMMENT ON COLUMN ecommerce_hero_queue.status IS 'pending = waiting, processing = in progress, completed = done, failed = error';
COMMENT ON COLUMN ecommerce_hero_queue.result_card_url IS 'Cloudinary URL for 400x400 square card image (used as cached_image_url)';


