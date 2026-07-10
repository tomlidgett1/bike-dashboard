-- Description: Idempotent inbox read marks (GREATEST on last_read_at)
-- Date: 2026-07-10
-- Ensures concurrent or repeated mark-read calls never move last_read_at backwards.

CREATE OR REPLACE FUNCTION public.mark_nest_conversation_read(
  p_user_id UUID,
  p_chat_id TEXT,
  p_last_read_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_read_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL OR p_chat_id IS NULL OR btrim(p_chat_id) = '' OR p_last_read_at IS NULL THEN
    RAISE EXCEPTION 'user_id, chat_id, and last_read_at are required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  INSERT INTO store_nest_conversation_reads (user_id, chat_id, last_read_at, updated_at)
  VALUES (p_user_id, p_chat_id, p_last_read_at, NOW())
  ON CONFLICT (user_id, chat_id) DO UPDATE
    SET
      last_read_at = GREATEST(
        store_nest_conversation_reads.last_read_at,
        EXCLUDED.last_read_at
      ),
      updated_at = NOW()
  RETURNING last_read_at INTO v_last_read_at;

  RETURN v_last_read_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_customer_inquiry_read(
  p_user_id UUID,
  p_inquiry_id UUID,
  p_last_read_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_read_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL OR p_inquiry_id IS NULL OR p_last_read_at IS NULL THEN
    RAISE EXCEPTION 'user_id, inquiry_id, and last_read_at are required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  INSERT INTO store_customer_inquiry_reads (user_id, inquiry_id, last_read_at, updated_at)
  VALUES (p_user_id, p_inquiry_id, p_last_read_at, NOW())
  ON CONFLICT (user_id, inquiry_id) DO UPDATE
    SET
      last_read_at = GREATEST(
        store_customer_inquiry_reads.last_read_at,
        EXCLUDED.last_read_at
      ),
      updated_at = NOW()
  RETURNING last_read_at INTO v_last_read_at;

  RETURN v_last_read_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_nest_conversation_read(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_customer_inquiry_read(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_nest_conversation_read(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_customer_inquiry_read(UUID, UUID, TIMESTAMPTZ) TO authenticated;
