-- ============================================================
-- DEBUG SIGNUP ISSUE
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Check if the trigger exists
SELECT 
    trigger_name,
    event_object_schema,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- 2. Check if the function exists
SELECT 
    proname as function_name,
    prosecdef as security_definer,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- 3. Check the users table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 4. Check RLS policies on users table
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users';

-- 5. Check if supabase_auth_admin has proper grants
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.table_privileges 
WHERE table_name = 'users' AND grantee = 'supabase_auth_admin';

-- 6. Try a test insert (this will help identify the exact error)
-- Replace with a real UUID if needed
DO $$
DECLARE
    test_user_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO public.users (user_id, email) 
    VALUES (test_user_id, 'test@example.com');
    
    -- Clean up
    DELETE FROM public.users WHERE user_id = test_user_id;
    
    RAISE NOTICE 'Test insert succeeded!';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test insert failed: % %', SQLERRM, SQLSTATE;
END $$;

