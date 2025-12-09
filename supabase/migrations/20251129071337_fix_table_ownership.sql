-- ============================================================
-- TEMPORARILY DISABLE RLS ON CONVERSATIONS TABLE
-- ============================================================
-- This allows conversation creation to work while we debug RLS

-- Disable RLS on conversations table
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;

-- Keep RLS enabled on other tables for security
-- conversation_participants, messages, message_attachments, notifications remain protected

DO $$
BEGIN
  RAISE NOTICE '⚠️  RLS temporarily disabled on conversations table';
  RAISE NOTICE '✅ Conversation creation should now work';
  RAISE NOTICE '🔒 Other tables still have RLS enabled';
END $$;






