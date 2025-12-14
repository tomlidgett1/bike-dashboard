-- ============================================================
-- GRANT EXPLICIT PERMISSIONS TO AUTHENTICATED ROLE
-- ============================================================
-- Sometimes RLS needs explicit GRANT in addition to policies

-- Grant table-level permissions to authenticated role
GRANT SELECT, INSERT, UPDATE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON messages TO authenticated;
GRANT SELECT, INSERT ON message_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;

-- Also grant usage on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ Explicit permissions granted to authenticated role';
END $$;










