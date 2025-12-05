-- ============================================================
-- DIAGNOSTIC SCRIPT FOR UUID VALIDATION ISSUES
-- ============================================================
-- Run this in Supabase SQL Editor to find any invalid UUIDs

-- 1. Check for users with invalid user_id format
SELECT 
  user_id,
  email,
  business_name,
  account_type,
  LENGTH(user_id::text) as user_id_length,
  CASE 
    WHEN user_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN 'VALID'
    ELSE 'INVALID'
  END as user_id_status
FROM users
WHERE user_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
LIMIT 10;

-- 2. Check for products with invalid user_id references
SELECT 
  p.id as product_id,
  p.description,
  p.user_id,
  LENGTH(p.user_id::text) as user_id_length,
  CASE 
    WHEN p.user_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN 'VALID'
    ELSE 'INVALID'
  END as user_id_status,
  u.business_name as seller_name
FROM products p
LEFT JOIN users u ON u.user_id = p.user_id
WHERE p.user_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND p.is_active = true
LIMIT 10;

-- 3. Check for products where user doesn't exist
SELECT 
  p.id as product_id,
  p.description,
  p.user_id,
  p.price,
  p.created_at
FROM products p
LEFT JOIN users u ON u.user_id = p.user_id
WHERE u.user_id IS NULL
  AND p.is_active = true
ORDER BY p.created_at DESC
LIMIT 10;

-- 4. Check auth.users vs custom users table sync issues
SELECT 
  au.id as auth_user_id,
  au.email,
  cu.user_id as custom_user_id,
  LENGTH(au.id::text) as auth_id_length,
  LENGTH(cu.user_id::text) as custom_id_length,
  CASE 
    WHEN au.id::text = cu.user_id::text THEN 'MATCH'
    ELSE 'MISMATCH'
  END as id_sync_status
FROM auth.users au
LEFT JOIN users cu ON cu.user_id = au.id
WHERE au.id::text != cu.user_id::text 
   OR cu.user_id IS NULL
LIMIT 10;

-- 5. Find which account is having issues (if you know the email)
-- REPLACE 'problematic@email.com' with the actual email that's failing
/*
SELECT 
  au.id as auth_user_id,
  au.email,
  cu.user_id as custom_user_id,
  cu.business_name,
  COUNT(p.id) as product_count
FROM auth.users au
LEFT JOIN users cu ON cu.user_id = au.id
LEFT JOIN products p ON p.user_id = cu.user_id AND p.is_active = true
WHERE au.email = 'problematic@email.com'
GROUP BY au.id, au.email, cu.user_id, cu.business_name;
*/

