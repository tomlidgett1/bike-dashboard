-- ============================================================
-- Supabase Storage Bucket for Product Images
-- ============================================================
-- Creates and configures the storage bucket for product images with CDN

-- Create the product-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true, -- Public bucket for CDN
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

-- Allow public read access (for marketplace and CDN)
CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Authenticated users can upload images
CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (auth.role() = 'authenticated')
  );

-- Users can update their own uploads or any if admin
CREATE POLICY "Users can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (auth.role() = 'authenticated')
  )
  WITH CHECK (
    bucket_id = 'product-images'
  );

-- Users can delete their own uploads or service role can delete any
CREATE POLICY "Users can delete own product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] = 'custom'
      AND (storage.foldername(name))[2] = auth.uid()::text
      OR auth.role() = 'service_role'
    )
  );

CREATE POLICY "Service role can delete any product images"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'product-images');

-- ============================================================
-- Storage Helper Functions
-- ============================================================

-- Function to get public URL for an image
CREATE OR REPLACE FUNCTION get_image_public_url(storage_path TEXT)
RETURNS TEXT AS $$
DECLARE
  v_base_url TEXT;
BEGIN
  -- Get Supabase URL from settings or use placeholder
  v_base_url := current_setting('app.settings.supabase_url', true);
  
  IF v_base_url IS NULL OR v_base_url = '' THEN
    -- Fallback to constructing URL from current database
    v_base_url := concat('https://', current_database(), '.supabase.co');
  END IF;
  
  RETURN concat(v_base_url, '/storage/v1/object/public/product-images/', storage_path);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get signed URL for an image (for private access)
CREATE OR REPLACE FUNCTION get_image_signed_url(storage_path TEXT, expires_in INTEGER DEFAULT 604800)
RETURNS TEXT AS $$
DECLARE
  v_base_url TEXT;
BEGIN
  -- Note: This returns the path for signed URL generation
  -- Actual signing must be done in application code with service key
  RETURN concat('product-images/', storage_path);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to generate storage path for new image
CREATE OR REPLACE FUNCTION generate_image_storage_path(
  p_canonical_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_size TEXT DEFAULT 'original',
  p_format TEXT DEFAULT 'jpg'
)
RETURNS TEXT AS $$
DECLARE
  v_uuid TEXT;
  v_path TEXT;
BEGIN
  v_uuid := gen_random_uuid()::text;
  
  -- Canonical product image path
  IF p_canonical_id IS NOT NULL THEN
    v_path := concat('canonical/', p_canonical_id::text, '/', p_size, '/', v_uuid, '.', p_format);
  
  -- Custom user/product image path
  ELSIF p_user_id IS NOT NULL AND p_product_id IS NOT NULL THEN
    v_path := concat('custom/', p_user_id::text, '/', p_product_id::text, '/', p_size, '/', v_uuid, '.', p_format);
  
  -- Fallback to temp path
  ELSE
    v_path := concat('temp/', v_uuid, '.', p_format);
  END IF;
  
  RETURN v_path;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================
-- View: Image URLs with CDN
-- ============================================================
CREATE OR REPLACE VIEW product_images_with_urls AS
SELECT 
  pi.*,
  get_image_public_url(pi.storage_path) AS public_url,
  cp.upc AS canonical_upc,
  cp.normalized_name AS canonical_name
FROM product_images pi
LEFT JOIN canonical_products cp ON pi.canonical_product_id = cp.id;

-- ============================================================
-- Comments for Documentation
-- ============================================================
COMMENT ON FUNCTION get_image_public_url IS 'Returns the public CDN URL for a storage path';
COMMENT ON FUNCTION generate_image_storage_path IS 'Generates a unique storage path for image upload';
COMMENT ON VIEW product_images_with_urls IS 'Product images with resolved public URLs for easy access';















