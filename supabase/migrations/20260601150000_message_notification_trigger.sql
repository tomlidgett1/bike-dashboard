-- ============================================================
-- MESSAGE NOTIFICATION TRIGGER
-- ============================================================
-- Creates a notification row for every conversation participant
-- (except the sender) whenever a new message is inserted.
-- The send-message-notification edge function polls this table
-- every 2 minutes and fires the actual email.

CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert one notification per recipient in this conversation
  INSERT INTO notifications (
    user_id,
    type,
    notification_category,
    priority,
    conversation_id,
    message_id,
    email_delivery_status,
    is_read
  )
  SELECT
    cp.user_id,
    'new_message',
    'message',
    'normal',
    NEW.conversation_id,
    NEW.id,
    'pending',
    false
  FROM conversation_participants cp
  WHERE
    cp.conversation_id = NEW.conversation_id
    AND cp.user_id != NEW.sender_id          -- skip the sender
    AND cp.notification_preference != 'none'; -- respect per-conversation opt-out

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_message_notification ON messages;

CREATE TRIGGER trigger_create_message_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_notification();

DO $$
BEGIN
  RAISE NOTICE '✅ Message notification trigger created';
END $$;
