-- ============================================================
-- FIX CONVERSATION PARTICIPANTS RLS POLICY
-- ============================================================
-- Fixes infinite recursion error in conversation_participants policy

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view conversation participants" ON conversation_participants;

-- Create a helper function with SECURITY DEFINER to check participation
CREATE OR REPLACE FUNCTION is_conversation_participant(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  is_participant BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM conversation_participants
    WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
  ) INTO is_participant;
  
  RETURN is_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create new policy using the security definer function
CREATE POLICY "Users can view conversation participants"
  ON conversation_participants FOR SELECT
  USING (
    -- Users can always see their own participant record
    user_id = auth.uid() 
    OR 
    -- Users can see other participants if they're in the same conversation
    is_conversation_participant(conversation_id, auth.uid())
  );

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION is_conversation_participant(UUID, UUID) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ Conversation participants RLS policy fixed!';
  RAISE NOTICE '🔐 No more infinite recursion errors';
END $$;






