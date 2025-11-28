-- Manual Storage Setup for Logo Upload Feature
-- Run this in your Supabase SQL Editor if the migration doesn't work

-- Step 1: Add logo_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Step 2: Create storage bucket for logos (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logo', 
  'logo', 
  true, 
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

-- Step 3: Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;

-- Step 4: Create new policies

-- Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload own logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logo' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own logos
CREATE POLICY "Users can update own logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logo' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'logo' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own logos
CREATE POLICY "Users can delete own logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logo' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view logos (public bucket)
CREATE POLICY "Anyone can view logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'logo');

-- Step 5: Verify the setup
SELECT 
  'Buckets' as type,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'logo'

UNION ALL

SELECT 
  'Policies' as type,
  policyname as id,
  tablename as name,
  cmd as public,
  null as file_size_limit,
  null as allowed_mime_types
FROM pg_policies
WHERE tablename = 'objects' AND policyname LIKE '%logo%';

