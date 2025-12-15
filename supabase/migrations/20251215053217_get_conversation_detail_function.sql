-- ============================================================
-- FAST CONVERSATION DETAIL FUNCTION
-- ============================================================
-- Single-query function for fetching a conversation with messages

CREATE OR REPLACE FUNCTION get_conversation_detail(
  p_user_id UUID,
  p_conversation_id UUID,
  p_message_limit INT DEFAULT 50
)
RETURNS TABLE (
  -- Conversation fields
  conversation_id UUID,
  subject TEXT,
  status TEXT,
  product_id UUID,
  last_message_at TIMESTAMPTZ,
  message_count INT,
  created_at TIMESTAMPTZ,
  -- Product fields
  product_description TEXT,
  product_display_name TEXT,
  product_price NUMERIC,
  product_image_url TEXT,
  -- Other participant
  other_user_id UUID,
  other_user_name TEXT,
  other_user_business_name TEXT,
  other_user_logo_url TEXT,
  -- User's participant record
  unread_count INT,
  is_archived BOOLEAN,
  -- Messages as JSON array
  messages_json JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_participant_exists BOOLEAN;
BEGIN
  -- First verify user is a participant
  SELECT EXISTS(
    SELECT 1 FROM conversation_participants 
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  ) INTO v_participant_exists;
  
  IF NOT v_participant_exists THEN
    RETURN;
  END IF;

  -- Mark conversation as read (fire and forget style - within the function)
  UPDATE conversation_participants
  SET last_read_at = NOW(), unread_count = 0
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  RETURN QUERY
  WITH conv AS (
    SELECT c.*
    FROM conversations c
    WHERE c.id = p_conversation_id
  ),
  prod AS (
    SELECT p.id, p.description, p.display_name, p.price, p.primary_image_url
    FROM products p
    WHERE p.id = (SELECT product_id FROM conv)
  ),
  other_part AS (
    SELECT cp.user_id, u.name, u.business_name, u.logo_url
    FROM conversation_participants cp
    JOIN users u ON u.user_id = cp.user_id
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id != p_user_id
    LIMIT 1
  ),
  user_part AS (
    SELECT cp.unread_count, cp.is_archived
    FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = p_user_id
  ),
  msgs AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'content', m.content,
        'sender_id', m.sender_id,
        'created_at', m.created_at,
        'is_own', m.sender_id = p_user_id
      ) ORDER BY m.created_at ASC
    ) as messages
    FROM (
      SELECT id, content, sender_id, created_at
      FROM messages
      WHERE conversation_id = p_conversation_id
        AND is_deleted = false
      ORDER BY created_at ASC
      LIMIT p_message_limit
    ) m
  )
  SELECT 
    conv.id as conversation_id,
    conv.subject,
    conv.status,
    conv.product_id,
    conv.last_message_at,
    COALESCE(conv.message_count, 0)::INT,
    conv.created_at,
    prod.description,
    prod.display_name,
    prod.price,
    prod.primary_image_url,
    other_part.user_id,
    other_part.name,
    other_part.business_name,
    other_part.logo_url,
    COALESCE(user_part.unread_count, 0)::INT,
    COALESCE(user_part.is_archived, false),
    COALESCE(msgs.messages, '[]'::jsonb)
  FROM conv
  LEFT JOIN prod ON true
  LEFT JOIN other_part ON true
  LEFT JOIN user_part ON true
  LEFT JOIN msgs ON true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_conversation_detail(UUID, UUID, INT) TO authenticated;

