-- ============================================================
-- FIX: CONVERSATION DETAIL FUNCTION
-- ============================================================
-- Fixed ambiguous column reference by using explicit table aliases

DROP FUNCTION IF EXISTS get_conversation_detail(UUID, UUID, INT);

CREATE OR REPLACE FUNCTION get_conversation_detail(
  p_user_id UUID,
  p_conversation_id UUID,
  p_message_limit INT DEFAULT 50
)
RETURNS TABLE (
  conversation_id UUID,
  subject TEXT,
  status TEXT,
  product_id UUID,
  last_message_at TIMESTAMPTZ,
  message_count INT,
  created_at TIMESTAMPTZ,
  product_description TEXT,
  product_display_name TEXT,
  product_price NUMERIC,
  product_image_url TEXT,
  other_user_id UUID,
  other_user_name TEXT,
  other_user_business_name TEXT,
  other_user_logo_url TEXT,
  unread_count INT,
  is_archived BOOLEAN,
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
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id AND cp.user_id = p_user_id
  ) INTO v_participant_exists;
  
  IF NOT v_participant_exists THEN
    RETURN;
  END IF;

  -- Mark conversation as read
  UPDATE conversation_participants cp
  SET last_read_at = NOW(), unread_count = 0
  WHERE cp.conversation_id = p_conversation_id AND cp.user_id = p_user_id;

  RETURN QUERY
  SELECT 
    c.id as conversation_id,
    c.subject,
    c.status,
    c.product_id,
    c.last_message_at,
    COALESCE(c.message_count, 0)::INT as message_count,
    c.created_at,
    p.description as product_description,
    p.display_name as product_display_name,
    p.price as product_price,
    p.primary_image_url as product_image_url,
    op.user_id as other_user_id,
    ou.name as other_user_name,
    ou.business_name as other_user_business_name,
    ou.logo_url as other_user_logo_url,
    COALESCE(up.unread_count, 0)::INT as unread_count,
    COALESCE(up.is_archived, false) as is_archived,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', msg.id,
            'content', msg.content,
            'sender_id', msg.sender_id,
            'created_at', msg.created_at,
            'is_own', msg.sender_id = p_user_id
          ) ORDER BY msg.created_at ASC
        )
        FROM (
          SELECT m.id, m.content, m.sender_id, m.created_at
          FROM messages m
          WHERE m.conversation_id = p_conversation_id
            AND m.is_deleted = false
          ORDER BY m.created_at ASC
          LIMIT p_message_limit
        ) msg
      ),
      '[]'::jsonb
    ) as messages_json
  FROM conversations c
  LEFT JOIN products p ON p.id = c.product_id
  LEFT JOIN conversation_participants op ON op.conversation_id = c.id AND op.user_id != p_user_id
  LEFT JOIN users ou ON ou.user_id = op.user_id
  LEFT JOIN conversation_participants up ON up.conversation_id = c.id AND up.user_id = p_user_id
  WHERE c.id = p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversation_detail(UUID, UUID, INT) TO authenticated;

