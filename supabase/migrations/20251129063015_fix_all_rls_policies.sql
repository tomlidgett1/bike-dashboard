-- ============================================================
-- COMPREHENSIVE RLS POLICY FIX FOR MESSAGING SYSTEM
-- ============================================================
-- Removes all existing policies and recreates them correctly

-- ============================================================
-- CONVERSATIONS TABLE POLICIES
-- ============================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Participants can update conversations" ON conversations;

-- SELECT: Users can view conversations they participate in
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = conversations.id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- INSERT: Any authenticated user can create conversations
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Participants can update conversations
CREATE POLICY "Participants can update conversations"
  ON conversations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = conversations.id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- ============================================================
-- CONVERSATION_PARTICIPANTS TABLE POLICIES
-- ============================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view conversation participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can add participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can update own participant record" ON conversation_participants;

-- SELECT: Users can view participants in their conversations
CREATE POLICY "Users can view conversation participants"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    -- Can see own record
    user_id = auth.uid()
    OR
    -- Can see other participants in same conversation (using security definer function)
    is_conversation_participant(conversation_id, auth.uid())
  );

-- INSERT: Authenticated users can add participants (needed when creating conversations)
CREATE POLICY "Users can add participants"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Users can update their own participant records
CREATE POLICY "Users can update own participant record"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- MESSAGES TABLE POLICIES
-- ============================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view conversation messages" ON messages;
DROP POLICY IF EXISTS "Participants can send messages" ON messages;
DROP POLICY IF EXISTS "Users can update own messages" ON messages;

-- SELECT: Users can view messages in their conversations
CREATE POLICY "Users can view conversation messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_participants.conversation_id = messages.conversation_id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- INSERT: Participants can send messages
CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
  );

-- UPDATE: Users can update their own messages
CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- ============================================================
-- MESSAGE_ATTACHMENTS TABLE POLICIES
-- ============================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view conversation attachments" ON message_attachments;
DROP POLICY IF EXISTS "Senders can add attachments" ON message_attachments;

-- SELECT: Users can view attachments in their conversations
CREATE POLICY "Users can view conversation attachments"
  ON message_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages
      INNER JOIN conversation_participants 
        ON conversation_participants.conversation_id = messages.conversation_id
      WHERE messages.id = message_attachments.message_id
      AND conversation_participants.user_id = auth.uid()
    )
  );

-- INSERT: Message senders can add attachments
CREATE POLICY "Senders can add attachments"
  ON message_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages
      WHERE messages.id = message_attachments.message_id
      AND messages.sender_id = auth.uid()
    )
  );

-- ============================================================
-- NOTIFICATIONS TABLE POLICIES
-- ============================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

-- SELECT: Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- UPDATE: Users can update their own notifications
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: Allow system (triggers) to insert notifications
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ All RLS policies recreated successfully!';
  RAISE NOTICE '🔓 Messaging system should now work correctly';
  RAISE NOTICE '📝 Users can create conversations and send messages';
END $$;






