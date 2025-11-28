-- Add logo_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create storage bucket for logos
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

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "logo_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "logo_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "logo_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "logo_delete_policy" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;

-- Policy: Allow authenticated users to upload to their own folder
CREATE POLICY "logo_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);

-- Policy: Allow anyone to view logos (public bucket)
CREATE POLICY "logo_select_policy"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'logo');

-- Policy: Allow users to update their own files
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

-- Policy: Allow users to delete their own files
CREATE POLICY "logo_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);
