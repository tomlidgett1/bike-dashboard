-- ============================================================
-- CHECK MESSAGING SYSTEM TABLES
-- ============================================================
-- Run this in Supabase SQL Editor to verify all tables exist

-- Check all messaging tables
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name IN ('conversations', 'conversation_participants', 'messages', 'message_attachments', 'notifications')
ORDER BY table_name;

-- Check RLS policies
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename IN ('conversations', 'conversation_participants', 'messages', 'message_attachments', 'notifications')
ORDER BY tablename, policyname;

-- Check functions
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%conversation%' OR routine_name LIKE '%message%'
ORDER BY routine_name;

-- Check storage bucket
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'message-attachments';

-- Test if we can insert a record (this will fail but shows us the exact error)
DO $$
BEGIN
  RAISE NOTICE 'All checks complete. Review the results above.';
END $$;








