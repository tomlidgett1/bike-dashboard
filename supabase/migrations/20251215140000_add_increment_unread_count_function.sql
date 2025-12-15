-- ============================================================
-- ADD INCREMENT UNREAD COUNT FUNCTION
-- ============================================================
-- This function increments unread_count for all participants in a
-- conversation except the sender when a new message is sent.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_unread_count(
  p_conversation_id UUID,
  p_sender_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment unread_count for all participants except the sender
  UPDATE conversation_participants
  SET 
    unread_count = unread_count + 1,
    updated_at = NOW()
  WHERE 
    conversation_id = p_conversation_id
    AND user_id != p_sender_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_unread_count(UUID, UUID) TO authenticated;

-- ============================================================
-- UPDATE CONVERSATION LAST_MESSAGE_AT TRIGGER
-- ============================================================
-- Also ensure conversations.last_message_at and message_count are updated

CREATE OR REPLACE FUNCTION update_conversation_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_update_conversation_on_new_message ON messages;

CREATE TRIGGER trigger_update_conversation_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_new_message();
