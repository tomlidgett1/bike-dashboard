-- Check what policies actually exist on conversations table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'conversations'
ORDER BY policyname;

-- Also check table owner and grants
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='conversations' 
AND table_schema='public';





