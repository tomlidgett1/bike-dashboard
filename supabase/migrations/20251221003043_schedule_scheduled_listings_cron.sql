-- ============================================================
-- Scheduled Listings Cron Job
-- ============================================================
-- Runs every 5 minutes to check for scheduled listings that are due
-- and publishes them as products in the database
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Function to trigger the edge function via HTTP
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_scheduled_listings_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_count INTEGER;
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Check if there are any pending scheduled listings due for publishing
  SELECT COUNT(*) INTO pending_count
  FROM scheduled_listings
  WHERE status = 'pending'
    AND scheduled_for <= NOW();
  
  -- Only trigger if there are pending listings due
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
    RAISE NOTICE '[SCHEDULED LISTINGS CRON] Found % pending listings due, triggering processing...', pending_count;
    
    -- Call the edge function using pg_net
    IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/process-scheduled-listings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := '{}'::jsonb
      );
      
      RAISE NOTICE '[SCHEDULED LISTINGS CRON] Edge function triggered successfully';
    ELSE
      RAISE WARNING '[SCHEDULED LISTINGS CRON] Missing supabase_url or service_role_key configuration';
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- Schedule the cron job to run every 5 minutes
-- ============================================================
-- Remove existing job if it exists
SELECT cron.unschedule('process-scheduled-listings')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-listings'
);

-- Schedule the job to run every 5 minutes
SELECT cron.schedule(
  'process-scheduled-listings',           -- job name
  '*/5 * * * *',                          -- every 5 minutes
  $$SELECT trigger_scheduled_listings_processing()$$
);

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION trigger_scheduled_listings_processing() TO service_role;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON FUNCTION trigger_scheduled_listings_processing() IS 
  'Triggers the process-scheduled-listings edge function when there are pending listings due for publishing';

-- ============================================================
-- Helper queries for monitoring
-- ============================================================
-- View scheduled cron jobs:
-- SELECT * FROM cron.job WHERE jobname = 'process-scheduled-listings';

-- View recent cron job runs:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-scheduled-listings')
-- ORDER BY start_time DESC LIMIT 10;

-- Manually trigger processing (for testing):
-- SELECT trigger_scheduled_listings_processing();

-- Unschedule the job (if needed):
-- SELECT cron.unschedule('process-scheduled-listings');

