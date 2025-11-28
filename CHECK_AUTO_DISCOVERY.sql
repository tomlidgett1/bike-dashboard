-- ============================================================
-- Check if AI Image Discovery Auto-Trigger is Working
-- ============================================================

-- STEP 1: Check if queue table exists
SELECT 'Queue Table' as component, 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_image_discovery_queue')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration first!'
  END as status;

-- STEP 2: Check if trigger function exists
SELECT 'Trigger Function' as component,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'auto_queue_canonical_for_ai_discovery'
    )
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration first!'
  END as status;

-- STEP 3: Check if trigger exists on canonical_products
SELECT 'Auto-Queue Trigger' as component,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.triggers 
      WHERE trigger_name = 'trigger_auto_queue_ai_discovery'
      AND event_object_table = 'canonical_products'
    )
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration first!'
  END as status;

-- STEP 4: Check queue contents
SELECT 
  '📊 Queue Status' as info,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM ai_image_discovery_queue;

-- STEP 5: Check recent queue items
SELECT 
  '📋 Recent Queue Items' as info,
  id,
  product_name,
  status,
  priority,
  created_at,
  updated_at
FROM ai_image_discovery_queue
ORDER BY created_at DESC
LIMIT 10;

-- STEP 6: Check canonical products without images
SELECT 
  '🔍 Products Needing Images' as info,
  COUNT(*) as count
FROM canonical_products cp
WHERE NOT EXISTS (
  SELECT 1 FROM product_images pi 
  WHERE pi.canonical_product_id = cp.id
);

-- STEP 7: Check if pg_cron job exists
SELECT 
  'Cron Job' as component,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM cron.job 
      WHERE jobname = 'process-ai-image-discovery'
    )
    THEN '✅ EXISTS'
    ELSE '⚠️  NOT CONFIGURED - Queue won''t process automatically'
  END as status;

-- STEP 8: Show cron job details if it exists
SELECT 
  jobid,
  schedule,
  command,
  active
FROM cron.job 
WHERE jobname = 'process-ai-image-discovery';

-- ============================================================
-- MANUAL TEST: Create a test product and see if it gets queued
-- ============================================================

-- Create a test canonical product
INSERT INTO canonical_products (upc, normalized_name, category)
VALUES ('TEST-AUTO-QUEUE-' || NOW()::text, 'Test Auto Queue Product', 'Test')
RETURNING id, normalized_name;

-- Wait a moment, then check if it was auto-queued
-- Run this query 5 seconds after running the INSERT above:
/*
SELECT 
  '🧪 Test Result' as info,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM ai_image_discovery_queue 
      WHERE product_name = 'Test Auto Queue Product'
    )
    THEN '✅ TRIGGER WORKING! Product was auto-queued'
    ELSE '❌ TRIGGER NOT WORKING! Product was NOT queued'
  END as result;

SELECT * FROM ai_image_discovery_queue 
WHERE product_name = 'Test Auto Queue Product';
*/

-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- If trigger doesn't exist, check if migration was run:
SELECT 
  version,
  name,
  executed_at
FROM supabase_migrations.schema_migrations
WHERE name LIKE '%ai_image_discovery%'
ORDER BY executed_at DESC;

-- Show all triggers on canonical_products table
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'canonical_products';

