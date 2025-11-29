-- ============================================================
-- SCHEDULE MESSAGE EMAIL NOTIFICATIONS
-- ============================================================
-- Sets up a cron job to process email notifications every 2 minutes
-- Calls the send-message-notification edge function

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cron job to process message notifications every 2 minutes
SELECT cron.schedule(
  'send-message-notifications',          -- Job name
  '*/2 * * * *',                         -- Every 2 minutes
  $$
  SELECT
    net.http_post(
      url:='https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/send-message-notification',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2c3hkb3lwdGlveXh1d3Z2cGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTE1OTEsImV4cCI6MjA3OTQ2NzU5MX0.BD6shwTOAH2ZD8P0fySy_Uf7W1GoUJZ2ffeYF1S_c0w"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================
-- HELPER: View scheduled jobs
-- ============================================================
-- Run this query to view all cron jobs:
-- SELECT * FROM cron.job;

-- ============================================================
-- HELPER: Delete this cron job (if needed)
-- ============================================================
-- Run this to remove the job:
-- SELECT cron.unschedule('send-message-notifications');

-- ============================================================
-- NOTES
-- ============================================================
-- 1. Replace REPLACE_WITH_YOUR_PROJECT_REF with your actual Supabase project reference
-- 2. Replace YOUR_ANON_KEY with your actual anon key
-- 3. The edge function must be deployed before this cron job will work
-- 4. Monitor execution: SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-message-notifications') ORDER BY start_time DESC LIMIT 10;

COMMENT ON EXTENSION pg_cron IS 'Cron-based job scheduler for PostgreSQL';

DO $$
BEGIN
  RAISE NOTICE '✅ Message notification cron job scheduled!';
  RAISE NOTICE '⏰ Runs every 2 minutes';
  RAISE NOTICE '📧 Sends email notifications for unread messages';
  RAISE NOTICE '⚠️  IMPORTANT: Update the edge function URL and auth key in the cron job!';
END $$;

