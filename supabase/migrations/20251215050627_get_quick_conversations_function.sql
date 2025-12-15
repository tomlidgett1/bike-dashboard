-- ============================================================
-- FAST CONVERSATION LIST FUNCTION
-- ============================================================
-- Single-query function for mobile messages panel
-- Returns conversations with sender info and last message in one call

CREATE OR REPLACE FUNCTION get_quick_conversations(
  p_user_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  conversation_id UUID,
  subject TEXT,
  unread_count INT,
  is_read BOOLEAN,
  last_message_at TIMESTAMPTZ,
  sender_name TEXT,
  sender_business_name TEXT,
  last_message_content TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH user_conversations AS (
    -- Get user's active, non-archived conversations
    SELECT 
      cp.conversation_id,
      cp.unread_count,
      c.subject,
      c.last_message_at
    FROM conversation_participants cp
    INNER JOIN conversations c ON c.id = cp.conversation_id
    WHERE cp.user_id = p_user_id
      AND cp.is_archived = false
      AND c.status = 'active'
    ORDER BY c.last_message_at DESC
    LIMIT p_limit
  ),
  other_participants AS (
    -- Get the other participant for each conversation
    SELECT DISTINCT ON (cp.conversation_id)
      cp.conversation_id,
      u.name,
      u.business_name
    FROM conversation_participants cp
    INNER JOIN users u ON u.user_id = cp.user_id
    WHERE cp.conversation_id IN (SELECT conversation_id FROM user_conversations)
      AND cp.user_id != p_user_id
  ),
  last_messages AS (
    -- Get the last message for each conversation
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content
    FROM messages m
    WHERE m.conversation_id IN (SELECT conversation_id FROM user_conversations)
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT 
    uc.conversation_id,
    uc.subject,
    COALESCE(uc.unread_count, 0)::INT as unread_count,
    COALESCE(uc.unread_count, 0) = 0 as is_read,
    uc.last_message_at,
    op.name as sender_name,
    op.business_name as sender_business_name,
    lm.content as last_message_content
  FROM user_conversations uc
  LEFT JOIN other_participants op ON op.conversation_id = uc.conversation_id
  LEFT JOIN last_messages lm ON lm.conversation_id = uc.conversation_id
  ORDER BY uc.last_message_at DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_quick_conversations(UUID, INT) TO authenticated;

