-- ============================================================
-- AI IMAGE DISCOVERY SYSTEM - SETUP & CONFIGURATION
-- ============================================================
-- Run this SQL in Supabase SQL Editor to set up the complete system

-- ============================================================
-- STEP 1: Create Queue Table and Functions
-- ============================================================
-- (Copy from migration file: 20251128022736_create_ai_image_discovery_queue.sql)
-- Or run: supabase db push

-- ============================================================
-- STEP 2: Enable pg_cron Extension
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify pg_cron is installed
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- ============================================================
-- STEP 3: Schedule Queue Processor (Every 5 Minutes)
-- ============================================================

-- First, unschedule if exists
SELECT cron.unschedule('process-ai-image-discovery');

-- Schedule the queue processor
-- Note: Replace {YOUR_FUNCTION_URL} and {YOUR_SERVICE_KEY}
SELECT cron.schedule(
  'process-ai-image-discovery',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/process-image-discovery-queue',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY_HERE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- Verify cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'process-ai-image-discovery';

-- ============================================================
-- STEP 4: Test the System
-- ============================================================

-- Add a test product to the queue
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
  10 -- High priority
FROM canonical_products
WHERE image_count = 0
LIMIT 1
ON CONFLICT (canonical_product_id) DO NOTHING;

-- Check queue status
SELECT 
  status,
  COUNT(*) as count,
  SUM(images_downloaded) as total_images_downloaded
FROM ai_image_discovery_queue
GROUP BY status
ORDER BY status;

-- ============================================================
-- STEP 5: Monitor Processing
-- ============================================================

-- View recent queue activity
SELECT 
  canonical_product_id,
  product_name,
  status,
  attempts,
  images_found,
  images_downloaded,
  created_at,
  completed_at
FROM ai_image_discovery_queue
ORDER BY created_at DESC
LIMIT 20;

-- Check processing performance
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_processing_seconds,
  AVG(images_downloaded) as avg_images_downloaded
FROM ai_image_discovery_queue
WHERE completed_at IS NOT NULL
GROUP BY status;

-- ============================================================
-- STEP 6: View Cron Job History
-- ============================================================

SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-ai-image-discovery')
ORDER BY start_time DESC
LIMIT 10;

-- ============================================================
-- STEP 7: Queue all existing products without images
-- ============================================================

-- This will queue all canonical products that have no images
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

-- Check how many were queued
SELECT COUNT(*) FROM ai_image_discovery_queue WHERE status = 'pending';

-- ============================================================
-- TROUBLESHOOTING QUERIES
-- ============================================================

-- Check failed items
SELECT 
  product_name,
  attempts,
  error_message,
  last_error_at
FROM ai_image_discovery_queue
WHERE status = 'failed'
ORDER BY last_error_at DESC;

-- Check items with no results
SELECT 
  product_name,
  upc,
  category
FROM ai_image_discovery_queue
WHERE status = 'no_results';

-- Manually reset a failed item for retry
-- UPDATE ai_image_discovery_queue
-- SET status = 'pending', attempts = 0, error_message = NULL
-- WHERE id = 'QUEUE_ITEM_ID';

-- Check OpenAI API responses
SELECT 
  product_name,
  images_found,
  images_downloaded,
  openai_response
FROM ai_image_discovery_queue
WHERE status = 'completed'
ORDER BY completed_at DESC
LIMIT 5;

-- ============================================================
-- COST TRACKING
-- ============================================================

-- Estimate costs
SELECT 
  COUNT(*) FILTER (WHERE status = 'completed') as successful_discoveries,
  COUNT(*) FILTER (WHERE status = 'completed') * 0.01 as estimated_cost_usd,
  SUM(images_downloaded) as total_images_downloaded
FROM ai_image_discovery_queue;

-- ============================================================
-- MANUAL CLEANUP (if needed)
-- ============================================================

-- Clear all failed items (to retry)
-- UPDATE ai_image_discovery_queue
-- SET status = 'pending', attempts = 0, error_message = NULL
-- WHERE status = 'failed';

-- Delete completed items older than 30 days
-- DELETE FROM ai_image_discovery_queue
-- WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '30 days';









