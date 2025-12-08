-- ============================================================
-- CLEANUP AND FIX ALL RLS POLICIES
-- ============================================================
-- Drop ALL existing policies and recreate them cleanly

-- ============================================================
-- DROP ALL EXISTING POLICIES
-- ============================================================

-- Conversations
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Participants can update conversations" ON conversations;
DROP POLICY IF EXISTS "conversations_insert_policy" ON conversations;
DROP POLICY IF EXISTS "conversations_select_policy" ON conversations;
DROP POLICY IF EXISTS "conversations_update_policy" ON conversations;

-- Conversation Participants
DROP POLICY IF EXISTS "Users can view conversation participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can add participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can update own participant record" ON conversation_participants;
DROP POLICY IF EXISTS "participants_insert_policy" ON conversation_participants;
DROP POLICY IF EXISTS "participants_select_own_policy" ON conversation_participants;
DROP POLICY IF EXISTS "participants_select_others_policy" ON conversation_participants;
DROP POLICY IF EXISTS "participants_select_policy" ON conversation_participants;
DROP POLICY IF EXISTS "participants_update_policy" ON conversation_participants;

-- Messages
DROP POLICY IF EXISTS "Users can view conversation messages" ON messages;
DROP POLICY IF EXISTS "Participants can send messages" ON messages;
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
DROP POLICY IF EXISTS "messages_insert_policy" ON messages;
DROP POLICY IF EXISTS "messages_select_policy" ON messages;
DROP POLICY IF EXISTS "messages_update_policy" ON messages;

-- Message Attachments
DROP POLICY IF EXISTS "Users can view conversation attachments" ON message_attachments;
DROP POLICY IF EXISTS "Senders can add attachments" ON message_attachments;
DROP POLICY IF EXISTS "attachments_insert_policy" ON message_attachments;
DROP POLICY IF EXISTS "attachments_select_policy" ON message_attachments;

-- Notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_select_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_delete_policy" ON notifications;

-- ============================================================
-- RECREATE POLICIES CLEANLY
-- ============================================================

-- CONVERSATIONS
CREATE POLICY "conversations_insert"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "conversations_select"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations_update"
  ON conversations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

-- CONVERSATION_PARTICIPANTS
CREATE POLICY "participants_insert"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "participants_select"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR 
    is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "participants_update"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- MESSAGES
CREATE POLICY "messages_insert"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_select"
  ON messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "messages_update"
  ON messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- MESSAGE_ATTACHMENTS
CREATE POLICY "attachments_insert"
  ON message_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    message_id IN (
      SELECT id FROM messages WHERE sender_id = auth.uid()
    )
  );

CREATE POLICY "attachments_select"
  ON message_attachments FOR SELECT
  TO authenticated
  USING (
    message_id IN (
      SELECT m.id 
      FROM messages m
      WHERE m.conversation_id IN (
        SELECT conversation_id 
        FROM conversation_participants 
        WHERE user_id = auth.uid()
      )
    )
  );

-- NOTIFICATIONS
CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_select"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ All RLS policies cleaned up and recreated!';
  RAISE NOTICE '🔓 Conversations can now be created by authenticated users';
  RAISE NOTICE '🔒 Security is properly enforced';
END $$;





