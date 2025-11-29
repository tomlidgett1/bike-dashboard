-- ============================================================
-- MESSAGING SYSTEM - Enterprise-Ready Async Messaging
-- ============================================================
-- This migration creates a complete messaging system for the marketplace
-- Supports: Product inquiries, user-to-user messaging, image attachments
-- Scale: Designed for 10M+ users with proper indexing and caching

-- ============================================================
-- 1. CONVERSATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived', 'closed')) DEFAULT 'active',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for conversations
CREATE INDEX idx_conversations_product_id ON conversations(product_id);
CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_status_last_message ON conversations(status, last_message_at DESC);

COMMENT ON TABLE conversations IS 'Main conversation container for messaging system';
COMMENT ON COLUMN conversations.product_id IS 'Optional product reference for product inquiries';
COMMENT ON COLUMN conversations.last_message_at IS 'Cached timestamp of last message for sorting';
COMMENT ON COLUMN conversations.message_count IS 'Cached count of messages in conversation';

-- ============================================================
-- 2. CONVERSATION PARTICIPANTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'participant')) DEFAULT 'participant',
  last_read_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  notification_preference TEXT NOT NULL CHECK (notification_preference IN ('all', 'none')) DEFAULT 'all',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_participants_unique UNIQUE (conversation_id, user_id)
);

-- Indexes for conversation_participants
CREATE INDEX idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
CREATE INDEX idx_conversation_participants_inbox ON conversation_participants(user_id, is_archived, last_read_at) WHERE is_archived = false;
CREATE INDEX idx_conversation_participants_unread ON conversation_participants(user_id, unread_count) WHERE unread_count > 0;

COMMENT ON TABLE conversation_participants IS 'Many-to-many relationship between users and conversations';
COMMENT ON COLUMN conversation_participants.last_read_at IS 'Timestamp when user last viewed the conversation';
COMMENT ON COLUMN conversation_participants.unread_count IS 'Cached unread message count for this user';

-- ============================================================
-- 3. MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('user', 'system')) DEFAULT 'user',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

-- Indexes for messages
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

COMMENT ON TABLE messages IS 'Individual messages within conversations';
COMMENT ON COLUMN messages.is_deleted IS 'Soft delete flag for content moderation';

-- ============================================================
-- 4. MESSAGE ATTACHMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for message_attachments
CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);
CREATE INDEX idx_message_attachments_created_at ON message_attachments(created_at);

COMMENT ON TABLE message_attachments IS 'Images and files attached to messages';
COMMENT ON COLUMN message_attachments.storage_path IS 'Path in Supabase Storage bucket';

-- ============================================================
-- 5. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_message', 'new_conversation')),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_emailed BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Indexes for notifications
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX idx_notifications_email_queue ON notifications(is_emailed, email_sent_at) WHERE is_emailed = false;

COMMENT ON TABLE notifications IS 'Notification queue for in-app and email alerts';
COMMENT ON COLUMN notifications.is_emailed IS 'Whether email notification has been sent';

-- ============================================================
-- 6. TRIGGERS & FUNCTIONS
-- ============================================================

-- Function: Update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  participant_record RECORD;
BEGIN
  -- Update conversation metadata
  UPDATE conversations
  SET 
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  -- Update unread counts and create notifications for all participants except sender
  FOR participant_record IN 
    SELECT user_id, notification_preference
    FROM conversation_participants
    WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id
  LOOP
    -- Increment unread count
    UPDATE conversation_participants
    SET 
      unread_count = unread_count + 1,
      updated_at = NOW()
    WHERE conversation_id = NEW.conversation_id
    AND user_id = participant_record.user_id;

    -- Create notification if preference is 'all'
    IF participant_record.notification_preference = 'all' THEN
      INSERT INTO notifications (user_id, type, conversation_id, message_id)
      VALUES (participant_record.user_id, 'new_message', NEW.conversation_id, NEW.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: After message insert
CREATE TRIGGER trigger_update_conversation_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_new_message();

-- Function: Mark conversation as read
CREATE OR REPLACE FUNCTION mark_conversation_read(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS void AS $$
BEGIN
  -- Update participant's last_read_at and reset unread_count
  UPDATE conversation_participants
  SET 
    last_read_at = NOW(),
    unread_count = 0,
    updated_at = NOW()
  WHERE conversation_id = p_conversation_id
  AND user_id = p_user_id;

  -- Mark all related notifications as read
  UPDATE notifications
  SET 
    is_read = true,
    read_at = NOW()
  WHERE conversation_id = p_conversation_id
  AND user_id = p_user_id
  AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user's total unread count
CREATE OR REPLACE FUNCTION get_user_unread_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_unread INTEGER;
BEGIN
  SELECT COALESCE(SUM(unread_count), 0)
  INTO total_unread
  FROM conversation_participants
  WHERE user_id = p_user_id
  AND is_archived = false;

  RETURN total_unread;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_messaging_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at columns
CREATE TRIGGER trigger_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_messaging_updated_at();

CREATE TRIGGER trigger_conversation_participants_updated_at
  BEFORE UPDATE ON conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_messaging_updated_at();

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: CONVERSATIONS
-- ============================================================

-- Users can view conversations they participate in
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = conversations.id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- Authenticated users can create conversations
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Participants can update conversation status
CREATE POLICY "Participants can update conversations"
  ON conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = conversations.id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- ============================================================
-- RLS Policies: CONVERSATION_PARTICIPANTS
-- ============================================================

-- Users can view participant records for their conversations
CREATE POLICY "Users can view conversation participants"
  ON conversation_participants FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM conversation_participants cp2
      WHERE cp2.conversation_id = conversation_participants.conversation_id
      AND cp2.user_id = auth.uid()
    )
  );

-- Users can insert participants when creating conversations
CREATE POLICY "Users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own participant records
CREATE POLICY "Users can update own participant record"
  ON conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- RLS Policies: MESSAGES
-- ============================================================

-- Users can view messages in their conversations
CREATE POLICY "Users can view conversation messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = messages.conversation_id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- Users can insert messages in conversations they participate in
CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = messages.conversation_id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- Users can update their own messages
CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE
  USING (sender_id = auth.uid());

-- ============================================================
-- RLS Policies: MESSAGE_ATTACHMENTS
-- ============================================================

-- Users can view attachments in their conversations
CREATE POLICY "Users can view conversation attachments"
  ON message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages
      INNER JOIN conversation_participants 
        ON conversation_participants.conversation_id = messages.conversation_id
      WHERE messages.id = message_attachments.message_id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- Message senders can add attachments
CREATE POLICY "Senders can add attachments"
  ON message_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages
      WHERE messages.id = message_attachments.message_id
      AND messages.sender_id = auth.uid()
    )
  );

-- ============================================================
-- RLS Policies: NOTIFICATIONS
-- ============================================================

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- System can insert notifications (via trigger)
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- GRANTS & PERMISSIONS
-- ============================================================

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON messages TO authenticated;
GRANT SELECT, INSERT ON message_attachments TO authenticated;
GRANT SELECT, UPDATE, DELETE ON notifications TO authenticated;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Messaging system created successfully!';
  RAISE NOTICE '📊 Tables: conversations, conversation_participants, messages, message_attachments, notifications';
  RAISE NOTICE '🔐 RLS policies enabled on all tables';
  RAISE NOTICE '⚡ Triggers and functions configured for automatic updates';
END $$;

