-- ===================================================================
-- AUTOMATIC LIGHTSPEED TOKEN REFRESH - SETUP
-- ===================================================================
-- Run this in your Supabase SQL Editor to set up automatic token refresh
-- This will refresh all Lightspeed OAuth tokens every 6 hours
-- ===================================================================

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Create a function to refresh tokens
CREATE OR REPLACE FUNCTION refresh_lightspeed_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response_id bigint;
  v_project_url text := 'https://lvsxdoyptioyxuwvvpgb.supabase.co';
  v_service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  -- If service key isn't in settings, try to get from auth.config
  IF v_service_key IS NULL THEN
    -- Use the anon key as fallback (you'll need to update this with actual service role key)
    v_service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2c3hkb3lwdGlveXh1d3Z2cGdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjUyNjY3OSwiZXhwIjoyMDQ4MTAyNjc5fQ.ZPdKR7Cg2_9YjeFZMBb_xnPj38lrEYn9VPSPWjLILjE';
  END IF;

  SELECT net.http_post(
    url := v_project_url || '/functions/v1/refresh-lightspeed-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb
  ) INTO v_response_id;

  RAISE NOTICE 'Token refresh triggered with request ID: %', v_response_id;
END;
$$;

-- Step 3: Remove existing schedule if present
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-lightspeed-tokens-every-6h');
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Step 4: Schedule the function to run every 6 hours
SELECT cron.schedule(
  'refresh-lightspeed-tokens-every-6h',
  '0 */6 * * *',  -- Every 6 hours at minute 0 (00:00, 06:00, 12:00, 18:00 UTC)
  $$SELECT refresh_lightspeed_tokens();$$
);

-- Step 5: Verify the schedule was created
SELECT 
  jobid, 
  jobname, 
  schedule, 
  active,
  command
FROM cron.job 
WHERE jobname = 'refresh-lightspeed-tokens-every-6h';

-- ===================================================================
-- MANUAL TRIGGER FOR TESTING
-- ===================================================================
-- Run this to manually trigger the token refresh right now:
-- SELECT refresh_lightspeed_tokens();

-- ===================================================================
-- VIEW CRON JOB HISTORY
-- ===================================================================
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-lightspeed-tokens-every-6h')
-- ORDER BY start_time DESC 
-- LIMIT 10;

-- ===================================================================
-- TO REMOVE THE SCHEDULE
-- ===================================================================
-- SELECT cron.unschedule('refresh-lightspeed-tokens-every-6h');
-- DROP FUNCTION IF EXISTS refresh_lightspeed_tokens();











