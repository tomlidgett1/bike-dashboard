-- ============================================================
-- Fix Scheduled Listings Cron Job v2
-- ============================================================
-- Recreate the cron job with correct format

-- First, list and remove ALL variations of this job
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN 
    SELECT jobid, jobname FROM cron.job 
    WHERE jobname LIKE '%scheduled%' OR jobname LIKE '%process-scheduled%'
  LOOP
    PERFORM cron.unschedule(job_record.jobid);
    RAISE NOTICE 'Unscheduled job: % (id: %)', job_record.jobname, job_record.jobid;
  END LOOP;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'No existing jobs to unschedule';
END $$;

-- Create the new cron job using the exact same format as working jobs
SELECT cron.schedule(
  'process-scheduled-listings',
  '*/5 * * * *',
  $$SELECT net.http_post(url:='https://frjcluhuictnbimitvrm.supabase.co/functions/v1/process-scheduled-listings',headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyamNsdWh1aWN0bmJpbWl0dnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTYyOTIsImV4cCI6MjA5Mjc3MjI5Mn0.O0TIc41PIdwXnXo9nO82X9h2Uv1PsujJMfisZkxz5zo"}'::jsonb,body:='{}'::jsonb) as request_id;$$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Scheduled listings cron job recreated successfully';
END $$;

