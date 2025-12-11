-- ============================================================
-- UPDATE CRON JOB WITH CORRECT PROJECT DETAILS
-- ============================================================
-- Run this SQL in your Supabase SQL Editor to update the cron job

-- First, unschedule the existing job
SELECT cron.unschedule('send-message-notifications');

-- Then, create it again with the correct URL and key
SELECT cron.schedule(
  'send-message-notifications',
  '*/2 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/send-message-notification',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2c3hkb3lwdGlveXh1d3Z2cGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTE1OTEsImV4cCI6MjA3OTQ2NzU5MX0.BD6shwTOAH2ZD8P0fySy_Uf7W1GoUJZ2ffeYF1S_c0w"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Verify it's scheduled
SELECT * FROM cron.job WHERE jobname = 'send-message-notifications';







