-- Fix the Lightspeed token refresh cron schedule.
-- The original migration (20251128062112) used 'vault.decrypted_secret' which is
-- wrong syntax — the correct column name is 'decrypted_secret'.
-- The broken syntax caused the pg_cron job to error silently, meaning tokens were
-- never proactively refreshed.

-- Remove the broken job
SELECT cron.unschedule('refresh-lightspeed-tokens')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-lightspeed-tokens');

-- Re-create with correct vault column syntax and a shorter interval (every 20 min)
-- so tokens are always refreshed well before the Lightspeed 30-min expiry window.
SELECT cron.schedule(
  'refresh-lightspeed-tokens',
  '*/20 * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL')
             || '/functions/v1/refresh-lightspeed-tokens',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
