-- ============================================================
-- Product Description Generation Cron Job
-- ============================================================
-- Runs every 5 minutes to process pending items in the queue
-- Works independently of the UI - queue processes in background
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Function to trigger the edge function via HTTP
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_description_generation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_count INTEGER;
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Check if there are any pending items
  SELECT COUNT(*) INTO pending_count
  FROM description_generation_queue
  WHERE status = 'pending';
  
  -- Only trigger if there are pending items
  IF pending_count > 0 THEN
    -- Get environment variables (these are set in Supabase Dashboard > Settings > Edge Functions)
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- If settings aren't configured, try vault secrets
    IF supabase_url IS NULL THEN
      SELECT decrypted_secret INTO supabase_url
      FROM vault.decrypted_secrets
      WHERE name = 'supabase_url'
      LIMIT 1;
    END IF;
    
    IF service_role_key IS NULL THEN
      SELECT decrypted_secret INTO service_role_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;
    END IF;
    
    -- Log the attempt
    RAISE NOTICE '[DESC-GEN CRON] Found % pending items, triggering processing...', pending_count;
    
    -- Call the edge function using pg_net
    IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/generate-product-descriptions',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object('limit', 5)
      );
      
      RAISE NOTICE '[DESC-GEN CRON] Edge function triggered successfully';
    ELSE
      RAISE WARNING '[DESC-GEN CRON] Missing supabase_url or service_role_key configuration';
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- Schedule the cron job to run every 5 minutes
-- ============================================================
-- Remove existing job if it exists
SELECT cron.unschedule('process-description-generation-queue')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-description-generation-queue'
);

-- Schedule the job to run every 5 minutes
SELECT cron.schedule(
  'process-description-generation-queue',   -- job name
  '*/5 * * * *',                            -- every 5 minutes
  $$SELECT trigger_description_generation()$$
);

-- ============================================================
-- Helper function for queue stats
-- ============================================================
CREATE OR REPLACE FUNCTION get_description_queue_stats()
RETURNS TABLE(
  pending_count INTEGER,
  processing_count INTEGER,
  completed_count INTEGER,
  failed_count INTEGER,
  total_with_descriptions INTEGER,
  total_without_descriptions INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM description_generation_queue WHERE status = 'pending'),
    (SELECT COUNT(*)::INTEGER FROM description_generation_queue WHERE status = 'processing'),
    (SELECT COUNT(*)::INTEGER FROM description_generation_queue WHERE status = 'completed'),
    (SELECT COUNT(*)::INTEGER FROM description_generation_queue WHERE status = 'failed'),
    (SELECT COUNT(*)::INTEGER FROM canonical_products WHERE product_description IS NOT NULL),
    (SELECT COUNT(*)::INTEGER FROM canonical_products WHERE product_description IS NULL);
END;
$$;

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION trigger_description_generation() TO service_role;
GRANT EXECUTE ON FUNCTION get_description_queue_stats() TO authenticated;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON FUNCTION trigger_description_generation() IS 'Triggers the product description generation edge function when there are pending items';
COMMENT ON FUNCTION get_description_queue_stats() IS 'Returns statistics about the description generation queue';

