-- ============================================================
-- DEBUG: AI Image Discovery Not Running
-- ============================================================

-- STEP 1: Check if queue table exists
SELECT COUNT(*) as queue_table_exists FROM ai_image_discovery_queue;
-- Expected: Should return a number (0 or more)
-- If error "relation does not exist": Run the migration SQL first!

-- STEP 2: Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_auto_queue_ai_discovery';
-- Expected: Should return 1 row
-- If 0 rows: Trigger not created, run migration SQL

-- STEP 3: Check if items are in the queue
SELECT 
  status,
  COUNT(*) as count
FROM ai_image_discovery_queue
GROUP BY status;
-- Expected: Should show pending items
-- If empty: Trigger not firing OR all products have images

-- STEP 4: Manually test the trigger
-- Create a test canonical product
INSERT INTO canonical_products (upc, normalized_name, category)
VALUES ('TEST-AI-DISCOVERY-' || NOW()::text, 'test product for ai discovery', 'Test')
RETURNING id;

-- Check if it was auto-queued (wait 1 second, then check)
SELECT * FROM ai_image_discovery_queue 
WHERE product_name = 'test product for ai discovery';
-- Expected: Should show 1 row with status='pending'
-- If empty: Trigger is NOT working!

-- STEP 5: Check pg_cron is configured
SELECT * FROM cron.job WHERE jobname = 'process-ai-image-discovery';
-- Expected: Should return 1 row
-- If empty: pg_cron not set up, run SETUP_AI_IMAGE_DISCOVERY.sql STEP 3

-- STEP 6: Check if pg_cron extension exists
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- Expected: Should return 1 row
-- If empty: Extension not installed (may need Supabase support to enable)

-- STEP 7: Manually add a canonical product to queue
INSERT INTO ai_image_discovery_queue (
  canonical_product_id,
  product_name,
  upc,
  category,
  manufacturer,
  priority
)
SELECT 
  id,
  normalized_name,
  upc,
  category,
  manufacturer,
  10
FROM canonical_products
WHERE image_count = 0
LIMIT 1
ON CONFLICT (canonical_product_id) DO NOTHING
RETURNING *;

-- Check if it was added
SELECT COUNT(*) FROM ai_image_discovery_queue WHERE status = 'pending';

-- ============================================================
-- QUICK FIX: If trigger isn't working
-- ============================================================

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS trigger_auto_queue_ai_discovery ON canonical_products;

CREATE TRIGGER trigger_auto_queue_ai_discovery
  AFTER INSERT ON canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION auto_queue_canonical_for_ai_discovery();

-- Verify trigger exists now
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_auto_queue_ai_discovery';

-- ============================================================
-- WORKAROUND: If pg_cron not available
-- ============================================================

-- Manually call the queue processor via SQL
SELECT net.http_post(
  url := 'https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/process-image-discovery-queue',
  headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY_HERE", "Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb
);

-- Check the result in the queue
SELECT * FROM ai_image_discovery_queue 
ORDER BY updated_at DESC 
LIMIT 5;

-- ============================================================
-- TEST: Call discovery function directly
-- ============================================================

-- Get a canonical product without images
SELECT 
  id,
  normalized_name,
  upc
FROM canonical_products
WHERE image_count = 0
LIMIT 1;

-- Now manually call the discovery function via curl:
-- (Replace CANONICAL_ID and SERVICE_KEY)
/*
curl -X POST \
  https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/discover-product-images \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"canonicalProductId": "PASTE_ID_HERE"}'
*/

-- Check if images were created
SELECT 
  canonical_product_id,
  storage_path,
  is_primary,
  created_at
FROM product_images
WHERE canonical_product_id = 'PASTE_CANONICAL_ID_HERE';

-- ============================================================
-- DIAGNOSIS SUMMARY
-- ============================================================

SELECT 
  'Migration' as component,
  CASE 
    WHEN EXISTS (SELECT 1 FROM ai_image_discovery_queue LIMIT 1) THEN '✅ Table exists'
    ELSE '❌ Table missing - Run migration'
  END as status
UNION ALL
SELECT 
  'Trigger' as component,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.triggers 
      WHERE trigger_name = 'trigger_auto_queue_ai_discovery'
    ) THEN '✅ Trigger exists'
    ELSE '❌ Trigger missing - Run migration'
  END as status
UNION ALL
SELECT 
  'pg_cron' as component,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM cron.job 
      WHERE jobname = 'process-ai-image-discovery'
    ) THEN '✅ Cron configured'
    ELSE '❌ Cron not setup - Run SETUP SQL STEP 3'
  END as status
UNION ALL
SELECT 
  'Queue Items' as component,
  COALESCE(
    (SELECT COUNT(*)::text || ' pending items' FROM ai_image_discovery_queue WHERE status = 'pending'),
    '0 pending items'
  ) as status;









