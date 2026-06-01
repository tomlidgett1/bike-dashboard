-- ============================================================
-- GRANULAR NOTIFICATION PREFERENCES
-- ============================================================
-- Adds per-type frequency control for messages and splits
-- offer_notifications_enabled into received vs updates

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS message_frequency TEXT NOT NULL DEFAULT 'smart'
    CHECK (message_frequency IN ('every_message', 'new_conversations_only', 'smart')),
  ADD COLUMN IF NOT EXISTS offer_received_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS offer_updates_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN notification_preferences.message_frequency IS
  'every_message = instant per message; smart = batch when active; new_conversations_only = first message in each conversation only';
COMMENT ON COLUMN notification_preferences.offer_received_enabled IS
  'Email when someone makes an offer on one of your listings';
COMMENT ON COLUMN notification_preferences.offer_updates_enabled IS
  'Email when an offer you made is accepted, rejected, countered, or expires';
