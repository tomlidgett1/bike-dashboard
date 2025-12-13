-- ============================================================
-- Listing Images Storage Bucket
-- ============================================================
-- Creates storage bucket for Facebook Marketplace imported listing images

-- Create the listing-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-images',
  'listing-images',
  true, -- Public bucket for marketplace listings
  10485760, -- 10MB limit per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

-- ============================================================
-- Storage RLS Policies
-- ============================================================

-- Allow public read access (for marketplace)
CREATE POLICY "Public can view listing images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');

-- Authenticated users can upload images to their own folder
CREATE POLICY "Authenticated users can upload listing images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own uploads
CREATE POLICY "Users can update own listing images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own uploads
CREATE POLICY "Users can delete own listing images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can manage all listing images
CREATE POLICY "Service role can manage listing images"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'listing-images')
  WITH CHECK (bucket_id = 'listing-images');

-- ============================================================
-- Success Message
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Listing images storage bucket created!';
  RAISE NOTICE '📦 Bucket: listing-images (public)';
  RAISE NOTICE '📏 File size limit: 10MB per image';
  RAISE NOTICE '🖼️  Allowed types: JPEG, PNG, WebP, AVIF, GIF';
  RAISE NOTICE '🔐 RLS policies configured for user uploads';
END $$;








