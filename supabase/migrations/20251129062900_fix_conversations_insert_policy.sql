-- ============================================================
-- FIX CONVERSATIONS INSERT POLICY
-- ============================================================
-- Fixes "new row violates row-level security policy" error

-- Drop existing insert policy
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;

-- Create a simpler, more permissive insert policy
-- Any authenticated user can create a conversation
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also update the SELECT policy to be more explicit
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;

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

DO $$
BEGIN
  RAISE NOTICE '✅ Conversations policies fixed!';
  RAISE NOTICE '🔓 Authenticated users can now create conversations';
END $$;











