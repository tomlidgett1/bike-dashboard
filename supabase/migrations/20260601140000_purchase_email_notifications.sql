-- ============================================================
-- PURCHASE EMAIL NOTIFICATIONS
-- ============================================================
-- Adds purchase_id to notifications table and per-type email
-- preference columns. Schedules the send-purchase-notification
-- edge function to run every minute via pg_cron.

-- ============================================================
-- 1. EXTEND NOTIFICATIONS TABLE
-- ============================================================

-- Add purchase_id column for linking purchase notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS purchase_id UUID;

-- Add foreign key to purchases table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_purchase_id_fkey'
  ) THEN
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_purchase_id_fkey
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for purchase notifications
CREATE INDEX IF NOT EXISTS idx_notifications_purchase_id
  ON notifications(purchase_id)
  WHERE purchase_id IS NOT NULL;

-- Composite index for processing transaction notifications
CREATE INDEX IF NOT EXISTS idx_notifications_transaction_pending
  ON notifications(notification_category, email_delivery_status, created_at)
  WHERE notification_category = 'transaction' AND email_delivery_status = 'pending';

-- ============================================================
-- 2. EXTEND NOTIFICATION_PREFERENCES TABLE
-- ============================================================
-- Add per-notification-type toggles so users can choose exactly
-- which email types they receive.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS purchase_confirmations_enabled BOOLEAN DEFAULT true;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS sale_notifications_enabled BOOLEAN DEFAULT true;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS offer_notifications_enabled BOOLEAN DEFAULT true;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS message_notifications_enabled BOOLEAN DEFAULT true;

-- ============================================================
-- 3. SCHEDULE PURCHASE NOTIFICATION CRON JOB
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('send-purchase-notifications');
EXCEPTION
  WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'send-purchase-notifications',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://frjcluhuictnbimitvrm.supabase.co/functions/v1/send-purchase-notification',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyamNsdWh1aWN0bmJpbWl0dnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTYyOTIsImV4cCI6MjA5Mjc3MjI5Mn0.O0TIc41PIdwXnXo9nO82X9h2Uv1PsujJMfisZkxz5zo"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================
-- SUCCESS
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Purchase email notifications migration complete';
  RAISE NOTICE '📊 notifications.purchase_id column added';
  RAISE NOTICE '📊 notification_preferences per-type columns added';
  RAISE NOTICE '⏰ send-purchase-notifications cron job scheduled (every minute)';
  RAISE NOTICE '⚠️  Deploy the send-purchase-notification edge function!';
END $$;
