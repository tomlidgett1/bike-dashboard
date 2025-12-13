-- ============================================================
-- FIX CONVERSATION_PARTICIPANTS RECURSION (FINAL)
-- ============================================================
-- Combines the two SELECT policies into one without recursion

-- Drop the existing SELECT policies
DROP POLICY IF EXISTS "participants_select_own_policy" ON conversation_participants;
DROP POLICY IF EXISTS "participants_select_others_policy" ON conversation_participants;

-- Create a single combined SELECT policy using SECURITY DEFINER function
-- The function bypasses RLS to check participation without recursion
CREATE POLICY "participants_select_policy"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR 
    is_conversation_participant(conversation_id, auth.uid())
  );

DO $$
BEGIN
  RAISE NOTICE '✅ Conversation participants recursion fixed!';
  RAISE NOTICE '🔒 Using security definer function to prevent recursion';
END $$;








