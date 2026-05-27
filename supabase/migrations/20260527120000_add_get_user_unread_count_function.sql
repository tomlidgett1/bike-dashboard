-- ============================================================
-- ADD GET USER UNREAD COUNT FUNCTION
-- ============================================================
-- Returns total unread messages for a user across non-archived
-- conversations. Used by unread count API routes.

CREATE OR REPLACE FUNCTION get_user_unread_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(unread_count), 0)::INTEGER
  FROM conversation_participants
  WHERE user_id = p_user_id
    AND is_archived = false;
$$;

GRANT EXECUTE ON FUNCTION get_user_unread_count(UUID) TO authenticated;
