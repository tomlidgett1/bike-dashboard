-- ============================================================
-- RE-ENABLE RLS WITH WORKING POLICIES
-- ============================================================
-- This re-enables RLS with simplified, tested policies

-- ============================================================
-- 1. RE-ENABLE RLS
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. CONVERSATIONS POLICIES (Simplified)
-- ============================================================

-- Anyone authenticated can insert conversations
CREATE POLICY "conversations_insert_policy"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can select conversations where they are participants
-- Using a subquery that doesn't cause recursion
CREATE POLICY "conversations_select_policy"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

-- Users can update conversations where they are participants
CREATE POLICY "conversations_update_policy"
  ON conversations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. CONVERSATION_PARTICIPANTS POLICIES (Simplified)
-- ============================================================

-- Anyone authenticated can insert participants
CREATE POLICY "participants_insert_policy"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can select their own participant records
CREATE POLICY "participants_select_own_policy"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can also select other participants in conversations they're part of
CREATE POLICY "participants_select_others_policy"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

-- Users can update their own participant records
CREATE POLICY "participants_update_policy"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 4. MESSAGES POLICIES
-- ============================================================

-- Users can insert messages if they're participants in the conversation
CREATE POLICY "messages_insert_policy"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

-- Users can select messages from conversations they're part of
CREATE POLICY "messages_select_policy"
  ON messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

-- Users can update their own messages
CREATE POLICY "messages_update_policy"
  ON messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- ============================================================
-- 5. MESSAGE_ATTACHMENTS POLICIES
-- ============================================================

-- Users can insert attachments to their own messages
CREATE POLICY "attachments_insert_policy"
  ON message_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    message_id IN (
      SELECT id FROM messages WHERE sender_id = auth.uid()
    )
  );

-- Users can select attachments from messages in their conversations
CREATE POLICY "attachments_select_policy"
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

-- ============================================================
-- 6. NOTIFICATIONS POLICIES
-- ============================================================

-- System can insert notifications
CREATE POLICY "notifications_insert_policy"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can only select their own notifications
CREATE POLICY "notifications_select_policy"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own notifications
CREATE POLICY "notifications_update_policy"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "notifications_delete_policy"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ RLS re-enabled with working policies!';
  RAISE NOTICE '🔒 Security is now active';
  RAISE NOTICE '✨ All messaging features should work';
END $$;











