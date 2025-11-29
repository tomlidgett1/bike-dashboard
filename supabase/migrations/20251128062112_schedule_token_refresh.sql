-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule token refresh to run every 6 hours
-- This keeps all Lightspeed OAuth tokens fresh and prevents expiration
SELECT cron.schedule(
  'refresh-lightspeed-tokens',  -- Job name
  '0 */6 * * *',                 -- Every 6 hours (at minute 0)
  $$
  SELECT
    net.http_post(
      url := (SELECT vault.decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/refresh-lightspeed-tokens',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT vault.decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Also create a cron job to clean up old job logs (optional, keeps table small)
SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 2 * * *',  -- Daily at 2 AM
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);





