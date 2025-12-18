-- ===================================================================
-- LIGHTSPEED TOKEN REFRESH SCHEDULER
-- ===================================================================
-- This sets up an automatic job that refreshes Lightspeed OAuth tokens
-- every 6 hours to prevent expiration and maintain active connections.
--
-- Run this SQL in your Supabase SQL Editor Dashboard
-- ===================================================================

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing schedule if it exists
SELECT cron.unschedule('refresh-lightspeed-tokens') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-lightspeed-tokens'
);

-- Schedule token refresh to run every 6 hours
-- Cron format: '0 */6 * * *' means at minute 0 of every 6th hour
-- (runs at 00:00, 06:00, 12:00, 18:00 UTC daily)
SELECT cron.schedule(
  'refresh-lightspeed-tokens',  -- Job name
  '0 */6 * * *',                 -- Every 6 hours
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.api_external_url', true)) || '/functions/v1/refresh-lightspeed-tokens',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.service_role_key', true))
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Optional: Schedule cleanup of old cron job logs (keeps logs table manageable)
SELECT cron.unschedule('cleanup-cron-logs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-cron-logs'
);

SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 2 * * *',  -- Daily at 2 AM UTC
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);

-- ===================================================================
-- VERIFY SETUP
-- ===================================================================
-- View all scheduled jobs
SELECT jobid, jobname, schedule, active 
FROM cron.job 
WHERE jobname IN ('refresh-lightspeed-tokens', 'cleanup-cron-logs');

-- ===================================================================
-- MANUAL TRIGGER (for testing)
-- ===================================================================
-- To manually trigger the token refresh right now, run:
-- 
-- SELECT net.http_post(
--   url := (SELECT current_setting('app.settings.api_external_url', true)) || '/functions/v1/refresh-lightspeed-tokens',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.service_role_key', true))
--   ),
--   body := '{}'::jsonb
-- );

-- ===================================================================
-- TO REMOVE THE SCHEDULE (if needed)
-- ===================================================================
-- SELECT cron.unschedule('refresh-lightspeed-tokens');
-- SELECT cron.unschedule('cleanup-cron-logs');















