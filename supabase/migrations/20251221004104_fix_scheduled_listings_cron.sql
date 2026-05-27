-- ============================================================
-- Fix Scheduled Listings Cron Job
-- ============================================================
-- Uses the simpler direct approach that works in other cron jobs

-- Unschedule the old job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-listings');
EXCEPTION
  WHEN others THEN
    -- Job doesn't exist, that's fine
    NULL;
END $$;

-- Drop the old function as we're using a simpler approach
DROP FUNCTION IF EXISTS trigger_scheduled_listings_processing();

-- Create the cron job with hardcoded URL (matching the pattern used in other cron jobs)
SELECT cron.schedule(
  'process-scheduled-listings',          -- Job name
  '*/5 * * * *',                         -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url:='https://frjcluhuictnbimitvrm.supabase.co/functions/v1/process-scheduled-listings',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyamNsdWh1aWN0bmJpbWl0dnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTYyOTIsImV4cCI6MjA5Mjc3MjI5Mn0.O0TIc41PIdwXnXo9nO82X9h2Uv1PsujJMfisZkxz5zo"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================
-- Helper queries
-- ============================================================
-- View the cron job:
-- SELECT * FROM cron.job WHERE jobname = 'process-scheduled-listings';

-- View recent runs:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-scheduled-listings')
-- ORDER BY start_time DESC LIMIT 10;

-- Unschedule (if needed):
-- SELECT cron.unschedule('process-scheduled-listings');

DO $$
BEGIN
  RAISE NOTICE '✅ Scheduled listings cron job created!';
  RAISE NOTICE '⏰ Runs every 5 minutes';
  RAISE NOTICE '📦 Publishes scheduled listings that are due';
END $$;

