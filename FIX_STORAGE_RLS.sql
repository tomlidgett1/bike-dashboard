-- DEFINITIVE FIX FOR STORAGE RLS ERROR
-- Run this in Supabase SQL Editor

-- Step 1: Ensure logo_url column exists in users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Step 2: Create or update the logo bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logo', 
  'logo', 
  true, 
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

-- Step 3: Drop ALL existing policies on storage.objects for logo bucket
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname LIKE '%logo%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- Step 4: Create simple, working policies

-- Allow authenticated users to INSERT (upload) to their own folder
CREATE POLICY "logo_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);

-- Allow authenticated users to SELECT (read) from logo bucket
CREATE POLICY "logo_select_policy"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'logo');

-- Allow authenticated users to UPDATE their own files
CREATE POLICY "logo_update_policy"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
)
WITH CHECK (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);

-- Allow authenticated users to DELETE their own files
CREATE POLICY "logo_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);

-- Step 5: Verify the setup
SELECT 
  'Bucket Configuration' as info_type,
  id,
  name,
  public::text,
  file_size_limit::text,
  array_to_string(allowed_mime_types, ', ') as mime_types
FROM storage.buckets
WHERE id = 'logo'

UNION ALL

SELECT 
  'RLS Policies' as info_type,
  policyname as id,
  cmd as name,
  CASE 
    WHEN roles @> ARRAY['authenticated'::name] THEN 'authenticated'
    WHEN roles @> ARRAY['anon'::name] THEN 'anon'
    ELSE 'other'
  END as public,
  tablename as file_size_limit,
  schemaname as mime_types
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects' 
  AND policyname LIKE '%logo%'
ORDER BY info_type, name;















