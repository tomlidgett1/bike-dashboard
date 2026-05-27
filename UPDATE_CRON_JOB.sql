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
      url:='https://frjcluhuictnbimitvrm.supabase.co/functions/v1/send-message-notification',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyamNsdWh1aWN0bmJpbWl0dnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTYyOTIsImV4cCI6MjA5Mjc3MjI5Mn0.O0TIc41PIdwXnXo9nO82X9h2Uv1PsujJMfisZkxz5zo"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Verify it's scheduled
SELECT * FROM cron.job WHERE jobname = 'send-message-notifications';











