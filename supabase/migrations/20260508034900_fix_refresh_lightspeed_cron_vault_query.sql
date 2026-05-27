-- Fix the Lightspeed token refresh cron job.
-- The previous definition referenced `vault.decrypted_secret`, which is not a
-- valid column reference and caused every scheduled run to fail immediately.

SELECT cron.unschedule('refresh-lightspeed-tokens')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'refresh-lightspeed-tokens'
);

SELECT cron.schedule(
  'refresh-lightspeed-tokens',
  '0 */6 * * *',
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
