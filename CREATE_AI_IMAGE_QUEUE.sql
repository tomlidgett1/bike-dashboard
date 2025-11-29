-- ============================================================
-- CREATE AI IMAGE DISCOVERY QUEUE TABLE
-- ============================================================
-- Run this ENTIRE file in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste this → Run

-- ============================================================
-- 1. Create Queue Table
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_image_discovery_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Product reference
  canonical_product_id UUID NOT NULL REFERENCES canonical_products(id) ON DELETE CASCADE,
  
  -- Product info for AI search
  product_name TEXT NOT NULL,
  upc TEXT,
  category TEXT,
  manufacturer TEXT,
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, no_results
  priority INTEGER DEFAULT 0, -- Higher = process first
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- AI response tracking
  search_query TEXT,
  openai_response JSONB,
  images_found INTEGER DEFAULT 0,
  images_downloaded INTEGER DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  last_error_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. Create Indexes
-- ============================================================

-- Primary queue queries (pending items by priority)
CREATE INDEX IF NOT EXISTS idx_ai_discovery_queue_status 
  ON ai_image_discovery_queue(status, priority DESC, created_at);

-- Canonical product lookup
CREATE INDEX IF NOT EXISTS idx_ai_discovery_queue_canonical 
  ON ai_image_discovery_queue(canonical_product_id);

-- Failed items needing retry
CREATE INDEX IF NOT EXISTS idx_ai_discovery_queue_retry 
  ON ai_image_discovery_queue(status, attempts, last_error_at)
  WHERE status = 'failed' AND attempts < max_attempts;

-- Unique constraint - one queue item per canonical product
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_discovery_queue_unique_canonical
  ON ai_image_discovery_queue(canonical_product_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================
ALTER TABLE ai_image_discovery_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS Policies
-- ============================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view discovery queue" ON ai_image_discovery_queue;
DROP POLICY IF EXISTS "Service role has full access to discovery queue" ON ai_image_discovery_queue;

-- Authenticated users can view queue items
CREATE POLICY "Authenticated users can view discovery queue"
  ON ai_image_discovery_queue FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access
CREATE POLICY "Service role has full access to discovery queue"
  ON ai_image_discovery_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. Trigger for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ai_image_discovery_queue_updated_at ON ai_image_discovery_queue;

CREATE TRIGGER update_ai_image_discovery_queue_updated_at
  BEFORE UPDATE ON ai_image_discovery_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. Function: Auto-Queue Canonical Products Without Images
-- ============================================================
CREATE OR REPLACE FUNCTION auto_queue_canonical_for_ai_discovery()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if no images exist for this canonical product
  IF NOT EXISTS (
    SELECT 1 FROM product_images WHERE canonical_product_id = NEW.id LIMIT 1
  ) THEN
    INSERT INTO ai_image_discovery_queue (
      canonical_product_id,
      product_name,
      upc,
      category,
      manufacturer,
      status,
      priority
    ) VALUES (
      NEW.id,
      NEW.normalized_name,
      NEW.upc,
      NEW.category,
      NEW.manufacturer,
      'pending',
      CASE 
        WHEN NEW.upc IS NOT NULL AND NEW.upc NOT LIKE 'TEMP-%' THEN 10 -- High priority for real UPCs
        ELSE 5 -- Lower priority for temp UPCs
      END
    )
    ON CONFLICT (canonical_product_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. Trigger on canonical_products INSERT
-- ============================================================
DROP TRIGGER IF EXISTS trigger_auto_queue_ai_discovery ON canonical_products;

CREATE TRIGGER trigger_auto_queue_ai_discovery
  AFTER INSERT ON canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION auto_queue_canonical_for_ai_discovery();

-- ============================================================
-- 8. Function: Get Next Queue Items for Processing
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_ai_discovery_items(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  canonical_product_id UUID,
  product_name TEXT,
  upc TEXT,
  category TEXT,
  manufacturer TEXT,
  attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_image_discovery_queue q
  SET 
    status = 'processing',
    started_at = NOW(),
    updated_at = NOW()
  FROM (
    SELECT q2.id
    FROM ai_image_discovery_queue q2
    WHERE q2.status = 'pending'
      AND (q2.last_error_at IS NULL OR q2.last_error_at < NOW() - INTERVAL '5 minutes' * POW(2, q2.attempts))
    ORDER BY q2.priority DESC, q2.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) AS batch
  WHERE q.id = batch.id
  RETURNING q.id, q.canonical_product_id, q.product_name, q.upc, q.category, q.manufacturer, q.attempts;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. Function: Mark Discovery Complete
-- ============================================================
CREATE OR REPLACE FUNCTION mark_discovery_complete(
  p_queue_id UUID,
  p_images_found INTEGER,
  p_images_downloaded INTEGER,
  p_openai_response JSONB,
  p_search_query TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE ai_image_discovery_queue
  SET 
    status = CASE 
      WHEN p_images_downloaded > 0 THEN 'completed'
      ELSE 'no_results'
    END,
    images_found = p_images_found,
    images_downloaded = p_images_downloaded,
    openai_response = p_openai_response,
    search_query = p_search_query,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 10. Function: Mark Discovery Failed
-- ============================================================
CREATE OR REPLACE FUNCTION mark_discovery_failed(
  p_queue_id UUID,
  p_error_message TEXT
)
RETURNS void AS $$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
BEGIN
  SELECT attempts, max_attempts 
  INTO v_attempts, v_max_attempts
  FROM ai_image_discovery_queue
  WHERE id = p_queue_id;
  
  UPDATE ai_image_discovery_queue
  SET 
    status = CASE 
      WHEN v_attempts + 1 >= v_max_attempts THEN 'failed'
      ELSE 'pending' -- Will retry
    END,
    attempts = v_attempts + 1,
    error_message = p_error_message,
    last_error_at = NOW(),
    updated_at = NOW()
  WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. Verify Everything Was Created
-- ============================================================
SELECT 
  'Table Created' as step,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_image_discovery_queue')
    THEN '✅ SUCCESS'
    ELSE '❌ FAILED'
  END as status;

SELECT 
  'Trigger Created' as step,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trigger_auto_queue_ai_discovery')
    THEN '✅ SUCCESS'
    ELSE '❌ FAILED'
  END as status;

SELECT 
  'Functions Created' as step,
  COUNT(*) || ' of 4 functions' as status
FROM pg_proc 
WHERE proname IN (
  'auto_queue_canonical_for_ai_discovery',
  'get_next_ai_discovery_items',
  'mark_discovery_complete',
  'mark_discovery_failed'
);

-- ============================================================
-- 12. Queue Existing Products Without Images
-- ============================================================
INSERT INTO ai_image_discovery_queue (
  canonical_product_id,
  product_name,
  upc,
  category,
  manufacturer,
  priority
)
SELECT 
  cp.id,
  cp.normalized_name,
  cp.upc,
  cp.category,
  cp.manufacturer,
  CASE 
    WHEN cp.upc NOT LIKE 'TEMP-%' THEN 10
    ELSE 5
  END as priority
FROM canonical_products cp
WHERE NOT EXISTS (
  SELECT 1 FROM product_images pi WHERE pi.canonical_product_id = cp.id
)
ON CONFLICT (canonical_product_id) DO NOTHING;

-- Show how many products were queued
SELECT 
  'Products Queued' as step,
  COUNT(*) || ' products' as status
FROM ai_image_discovery_queue 
WHERE status = 'pending';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
SELECT '🎉 AI Image Discovery Queue Created Successfully!' as message;
SELECT 'Next Step: Set up pg_cron to process the queue automatically' as next_step;
SELECT 'See: DIAGNOSE_AND_FIX_AUTO_DISCOVERY.md' as documentation;





