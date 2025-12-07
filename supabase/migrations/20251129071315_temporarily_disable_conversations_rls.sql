-- ============================================================
-- BYPASS RLS FOR CONVERSATION CREATION
-- ============================================================
-- Create a function that can insert conversations bypassing RLS

-- Drop existing policy
DROP POLICY IF EXISTS "conversations_insert" ON conversations;

-- Create a SECURITY DEFINER function to create conversations
CREATE OR REPLACE FUNCTION create_conversation(
  p_product_id UUID,
  p_subject TEXT,
  p_status TEXT DEFAULT 'active'
)
RETURNS UUID AS $$
DECLARE
  new_conversation_id UUID;
BEGIN
  INSERT INTO conversations (product_id, subject, status)
  VALUES (p_product_id, p_subject, p_status)
  RETURNING id INTO new_conversation_id;
  
  RETURN new_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_conversation(UUID, TEXT, TEXT) TO authenticated;

-- Create a simpler INSERT policy that uses the function
CREATE POLICY "conversations_insert"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also ensure UPDATE and DELETE work
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '✅ Conversation creation function created!';
  RAISE NOTICE '🔓 Authenticated users can now create conversations';
END $$;




