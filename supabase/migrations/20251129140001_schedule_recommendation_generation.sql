-- ============================================================
-- Schedule Recommendation Generation Edge Function
-- Runs every 15 minutes to pre-generate recommendations
-- ============================================================

-- Create cron job to run recommendation generation
SELECT cron.schedule(
  'generate-recommendations-every-15min',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-recommendations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Alternative: If cron extension is not available, create a note
COMMENT ON FUNCTION calculate_popularity_scores IS 
'Run this function every 15 minutes via external cron or Supabase scheduled functions to keep recommendations fresh';

-- Create manual trigger function for testing
CREATE OR REPLACE FUNCTION trigger_recommendation_generation()
RETURNS text AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-recommendations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  RETURN 'Recommendation generation triggered';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;








