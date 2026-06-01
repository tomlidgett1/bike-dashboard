-- ============================================================
-- WELCOME EMAIL TRIGGER
-- ============================================================
-- Fires when a new row is inserted into the users table and
-- queues a welcome notification for the send-welcome-email
-- edge function to process.

CREATE OR REPLACE FUNCTION create_welcome_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notifications (
    user_id,
    type,
    notification_category,
    priority,
    email_delivery_status,
    is_read
  ) VALUES (
    NEW.user_id,
    'welcome',
    'welcome',
    'normal',
    'pending',
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_welcome_notification ON users;

CREATE TRIGGER trigger_create_welcome_notification
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_welcome_notification();

-- Schedule the welcome email sender to run every minute
SELECT cron.schedule(
  'send-welcome-emails',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Welcome email trigger and cron job created';
END $$;
