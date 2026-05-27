-- ===================================================================
-- AUTOMATIC LIGHTSPEED TOKEN REFRESH - SETUP
-- ===================================================================
-- Run this in your Supabase SQL Editor to set up automatic token refresh
-- This will refresh all Lightspeed OAuth tokens every 6 hours
-- ===================================================================

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Remove existing schedule if present
SELECT cron.unschedule('refresh-lightspeed-tokens')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'refresh-lightspeed-tokens'
);

-- Step 3: Schedule the function to run every 6 hours
SELECT cron.schedule(
  'refresh-lightspeed-tokens',
  '0 */6 * * *',  -- Every 6 hours at minute 0 (00:00, 06:00, 12:00, 18:00 UTC)
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL')
        || '/functions/v1/refresh-lightspeed-tokens',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Step 5: Verify the schedule was created
SELECT 
  jobid, 
  jobname, 
  schedule, 
  active,
  command
FROM cron.job 
WHERE jobname = 'refresh-lightspeed-tokens';

-- ===================================================================
-- MANUAL TRIGGER FOR TESTING
-- ===================================================================
-- Run this to manually trigger the token refresh right now:
-- SELECT net.http_post(
--   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL')
--     || '/functions/v1/refresh-lightspeed-tokens',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer ' || (
--       SELECT decrypted_secret
--       FROM vault.decrypted_secrets
--       WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
--     )
--   ),
--   body := '{}'::jsonb
-- );

-- ===================================================================
-- VIEW CRON JOB HISTORY
-- ===================================================================
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-lightspeed-tokens')
-- ORDER BY start_time DESC 
-- LIMIT 10;

-- ===================================================================
-- TO REMOVE THE SCHEDULE
-- ===================================================================
-- SELECT cron.unschedule('refresh-lightspeed-tokens');















