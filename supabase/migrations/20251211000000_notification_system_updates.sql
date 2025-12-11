-- ============================================================
-- NOTIFICATION SYSTEM UPDATES
-- ============================================================
-- Adds notification preferences table, extends notifications table,
-- adds offer notification types and triggers

-- ============================================================
-- 1. NOTIFICATION PREFERENCES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  email_frequency TEXT DEFAULT 'smart' CHECK (email_frequency IN ('instant', 'smart', 'digest', 'critical_only')),
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup by user
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- ============================================================
-- 2. EXTEND NOTIFICATIONS TABLE
-- ============================================================

-- Add new columns for smart batching and offer notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_category TEXT DEFAULT 'message';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_scheduled_for TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_delivery_status TEXT DEFAULT 'pending';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS offer_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_key TEXT;

-- Add foreign key for offer_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_offer_id_fkey'
  ) THEN
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_offer_id_fkey 
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add check constraints
DO $$
BEGIN
  -- Drop existing type constraint if exists
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  -- Add new type constraint with offer types
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'new_message', 'new_conversation',
      'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired',
      'purchase_complete', 'listing_sold'
    )
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update type constraint: %', SQLERRM;
END $$;

-- Add category constraint
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
    notification_category IN ('message', 'offer', 'transaction', 'system')
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add category constraint: %', SQLERRM;
END $$;

-- Add priority constraint
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_priority_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_priority_check CHECK (
    priority IN ('critical', 'high', 'normal', 'low')
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add priority constraint: %', SQLERRM;
END $$;

-- Add delivery status constraint
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_delivery_status_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_delivery_status_check CHECK (
    email_delivery_status IN ('pending', 'scheduled', 'sent', 'skipped', 'failed')
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add delivery status constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 3. INDEXES FOR NOTIFICATION PROCESSING
-- ============================================================

-- Index for finding pending notifications to email
CREATE INDEX IF NOT EXISTS idx_notifications_pending_email 
  ON notifications(email_delivery_status, created_at) 
  WHERE email_delivery_status = 'pending';

-- Index for finding scheduled notifications
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled 
  ON notifications(email_scheduled_for) 
  WHERE email_scheduled_for IS NOT NULL AND email_delivery_status = 'scheduled';

-- Index for offer notifications
CREATE INDEX IF NOT EXISTS idx_notifications_offer_id ON notifications(offer_id) WHERE offer_id IS NOT NULL;

-- Index for batch processing
CREATE INDEX IF NOT EXISTS idx_notifications_batch_key ON notifications(batch_key) WHERE batch_key IS NOT NULL;

-- Composite index for smart batching (conversation + pending status)
CREATE INDEX IF NOT EXISTS idx_notifications_conversation_pending 
  ON notifications(conversation_id, email_delivery_status) 
  WHERE conversation_id IS NOT NULL AND email_delivery_status = 'pending';

-- ============================================================
-- 4. OFFER NOTIFICATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION create_offer_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New offer: notify seller
    INSERT INTO notifications (
      user_id, 
      type, 
      notification_category, 
      priority, 
      offer_id,
      email_delivery_status
    )
    VALUES (
      NEW.seller_id, 
      'offer_received', 
      'offer', 
      'high', 
      NEW.id,
      'pending'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Status changed: notify appropriate party
    CASE NEW.status
      WHEN 'accepted' THEN
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status
        )
        VALUES (
          NEW.buyer_id, 
          'offer_accepted', 
          'offer', 
          'critical', 
          NEW.id,
          'pending'
        );
      WHEN 'rejected' THEN
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status
        )
        VALUES (
          NEW.buyer_id, 
          'offer_rejected', 
          'offer', 
          'high', 
          NEW.id,
          'pending'
        );
      WHEN 'countered' THEN
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status
        )
        VALUES (
          NEW.buyer_id, 
          'offer_countered', 
          'offer', 
          'high', 
          NEW.id,
          'pending'
        );
      WHEN 'expired' THEN
        -- Notify both parties when offer expires
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status
        )
        VALUES 
          (NEW.buyer_id, 'offer_expired', 'offer', 'normal', NEW.id, 'pending'),
          (NEW.seller_id, 'offer_expired', 'offer', 'normal', NEW.id, 'pending');
      ELSE
        -- No notification for other status changes
        NULL;
    END CASE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_create_offer_notification ON offers;

CREATE TRIGGER trigger_create_offer_notification
  AFTER INSERT OR UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION create_offer_notification();

-- ============================================================
-- 5. AUTO-CREATE NOTIFICATION PREFERENCES FOR NEW USERS
-- ============================================================

CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on users table to create preferences when profile is created
DROP TRIGGER IF EXISTS trigger_create_notification_preferences ON users;

CREATE TRIGGER trigger_create_notification_preferences
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Backfill notification preferences for existing users
INSERT INTO notification_preferences (user_id)
SELECT user_id FROM users
WHERE user_id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 6. HELPER FUNCTION: Get user's last activity timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_last_message_activity(p_user_id UUID)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN (
    SELECT MAX(created_at)
    FROM messages
    WHERE sender_id = p_user_id
    AND created_at > NOW() - INTERVAL '30 minutes'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. SCHEDULE OFFER NOTIFICATION CRON JOB
-- ============================================================
-- Note: This creates the cron job for offer notifications
-- The edge function URL and auth key should be updated after deployment

-- First check if pg_cron extension exists (it should from message notifications)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule offer notifications to run every minute (offers are time-sensitive)
-- Note: You must update the URL and Bearer token after deploying the edge function
DO $$
BEGIN
  -- Remove existing job if it exists
  PERFORM cron.unschedule('send-offer-notifications');
EXCEPTION
  WHEN others THEN
    -- Job doesn't exist, that's fine
    NULL;
END $$;

SELECT cron.schedule(
  'send-offer-notifications',          -- Job name
  '* * * * *',                         -- Every minute
  $$
  SELECT
    net.http_post(
      url:='https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/send-offer-notification',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2c3hkb3lwdGlveXh1d3Z2cGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTE1OTEsImV4cCI6MjA3OTQ2NzU5MX0.BD6shwTOAH2ZD8P0fySy_Uf7W1GoUJZ2ffeYF1S_c0w"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Notification system updates completed successfully';
  RAISE NOTICE '📊 Tables: notification_preferences created';
  RAISE NOTICE '🔔 Notifications table extended with new columns';
  RAISE NOTICE '⚡ Offer notification triggers created';
  RAISE NOTICE '⏰ Offer notification cron job scheduled (every minute)';
  RAISE NOTICE '🔒 RLS policies enabled';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Deploy the send-offer-notification edge function!';
  RAISE NOTICE '⚠️  IMPORTANT: Add RESEND_API_KEY, FROM_EMAIL, APP_URL to Supabase secrets!';
END $$;

