-- ============================================================
-- FAST CONVERSATIONS LIST FUNCTION
-- ============================================================
-- Single-query function for the full messages page
-- Returns all conversation data in one optimized call

CREATE OR REPLACE FUNCTION get_conversations_list(
  p_user_id UUID,
  p_archived BOOLEAN DEFAULT false,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  conversation_id UUID,
  subject TEXT,
  status TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INT,
  unread_count INT,
  is_archived BOOLEAN,
  product_id UUID,
  product_description TEXT,
  product_display_name TEXT,
  product_image_url TEXT,
  other_user_id UUID,
  other_user_name TEXT,
  other_user_business_name TEXT,
  other_user_logo_url TEXT,
  last_message_content TEXT,
  last_message_sender_id UUID,
  last_message_created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH user_conversations AS (
    -- Get user's conversations with pagination
    SELECT 
      cp.conversation_id,
      cp.unread_count,
      cp.is_archived,
      c.subject,
      c.status,
      c.last_message_at,
      c.message_count,
      c.product_id
    FROM conversation_participants cp
    INNER JOIN conversations c ON c.id = cp.conversation_id
    WHERE cp.user_id = p_user_id
      AND cp.is_archived = p_archived
    ORDER BY c.last_message_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  products AS (
    -- Get product info for conversations that have products
    SELECT 
      p.id,
      p.description,
      p.display_name,
      p.primary_image_url
    FROM products p
    WHERE p.id IN (SELECT product_id FROM user_conversations WHERE product_id IS NOT NULL)
  ),
  other_participants AS (
    -- Get the other participant for each conversation
    SELECT DISTINCT ON (cp.conversation_id)
      cp.conversation_id,
      cp.user_id,
      u.name,
      u.business_name,
      u.logo_url
    FROM conversation_participants cp
    INNER JOIN users u ON u.user_id = cp.user_id
    WHERE cp.conversation_id IN (SELECT conversation_id FROM user_conversations)
      AND cp.user_id != p_user_id
  ),
  last_messages AS (
    -- Get the last message for each conversation
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content,
      m.sender_id,
      m.created_at
    FROM messages m
    WHERE m.conversation_id IN (SELECT conversation_id FROM user_conversations)
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT 
    uc.conversation_id,
    uc.subject,
    uc.status,
    uc.last_message_at,
    COALESCE(uc.message_count, 0)::INT as message_count,
    COALESCE(uc.unread_count, 0)::INT as unread_count,
    uc.is_archived,
    uc.product_id,
    pr.description as product_description,
    pr.display_name as product_display_name,
    pr.primary_image_url as product_image_url,
    op.user_id as other_user_id,
    op.name as other_user_name,
    op.business_name as other_user_business_name,
    op.logo_url as other_user_logo_url,
    lm.content as last_message_content,
    lm.sender_id as last_message_sender_id,
    lm.created_at as last_message_created_at
  FROM user_conversations uc
  LEFT JOIN products pr ON pr.id = uc.product_id
  LEFT JOIN other_participants op ON op.conversation_id = uc.conversation_id
  LEFT JOIN last_messages lm ON lm.conversation_id = uc.conversation_id
  ORDER BY uc.last_message_at DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_conversations_list(UUID, BOOLEAN, INT, INT) TO authenticated;


