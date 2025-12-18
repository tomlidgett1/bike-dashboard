-- ============================================================
-- E-Commerce Hero Queue Cron Job
-- ============================================================
-- Runs every minute to process pending items in the queue
-- Works independently of the UI - queue processes in background
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Function to trigger the edge function via HTTP
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_ecommerce_hero_processing()
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
  FROM ecommerce_hero_queue
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
    RAISE NOTICE '[ECOMMERCE-HERO CRON] Found % pending items, triggering processing...', pending_count;
    
    -- Call the edge function using pg_net
    IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/process-ecommerce-hero-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object('batchSize', 5)
      );
      
      RAISE NOTICE '[ECOMMERCE-HERO CRON] Edge function triggered successfully';
    ELSE
      RAISE WARNING '[ECOMMERCE-HERO CRON] Missing supabase_url or service_role_key configuration';
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- Schedule the cron job to run every minute
-- ============================================================
-- Remove existing job if it exists
SELECT cron.unschedule('process-ecommerce-hero-queue')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-ecommerce-hero-queue'
);

-- Schedule the job to run every minute
SELECT cron.schedule(
  'process-ecommerce-hero-queue',           -- job name
  '* * * * *',                              -- every minute
  $$SELECT trigger_ecommerce_hero_processing()$$
);

-- ============================================================
-- Alternative: Direct database processing (no edge function)
-- ============================================================
-- This is a simpler alternative that processes directly in PostgreSQL
-- Useful if edge function calls are problematic

CREATE OR REPLACE FUNCTION process_ecommerce_hero_queue_direct()
RETURNS TABLE(processed INTEGER, failed INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_failed INTEGER := 0;
  v_item RECORD;
BEGIN
  -- Mark stuck items as pending again
  UPDATE ecommerce_hero_queue
  SET 
    status = 'pending',
    processing_started_at = NULL,
    retry_count = retry_count + 1
  WHERE status = 'processing'
    AND processing_started_at < NOW() - INTERVAL '5 minutes'
    AND retry_count < 3;

  -- Note: The actual OpenAI and Cloudinary processing must happen in the edge function
  -- This function just helps with queue management and monitoring
  
  -- Return current counts for monitoring
  SELECT COUNT(*) FILTER (WHERE status = 'completed') INTO v_processed
  FROM ecommerce_hero_queue
  WHERE processing_completed_at > NOW() - INTERVAL '1 hour';
  
  SELECT COUNT(*) FILTER (WHERE status = 'failed') INTO v_failed
  FROM ecommerce_hero_queue
  WHERE processing_completed_at > NOW() - INTERVAL '1 hour';
  
  RETURN QUERY SELECT v_processed, v_failed;
END;
$$;

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION trigger_ecommerce_hero_processing() TO service_role;
GRANT EXECUTE ON FUNCTION process_ecommerce_hero_queue_direct() TO service_role;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON FUNCTION trigger_ecommerce_hero_processing() IS 'Triggers the e-commerce hero processing edge function when there are pending items';


