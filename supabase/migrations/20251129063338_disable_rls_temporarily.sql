-- ============================================================
-- TEMPORARILY DISABLE RLS FOR TESTING
-- ============================================================
-- This will help us confirm if RLS is the issue
-- WARNING: This is ONLY for development testing!

-- Disable RLS on conversations table temporarily
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  RAISE NOTICE '⚠️  WARNING: RLS TEMPORARILY DISABLED FOR TESTING';
  RAISE NOTICE '🔓 All messaging tables are now accessible without restrictions';
  RAISE NOTICE '⚠️  RE-ENABLE RLS AFTER TESTING!';
END $$;





