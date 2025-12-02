-- ============================================================
-- Add Cloudinary URL Columns to product_images
-- Migrating from Supabase Storage to Cloudinary CDN
-- Each image will have: thumbnail (100px), card (400px), detail (800px)
-- ============================================================

-- Add Cloudinary URL columns
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS cloudinary_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS card_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS detail_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;

-- Add index for faster lookups on images that need migration
CREATE INDEX IF NOT EXISTS idx_product_images_needs_migration 
ON product_images(storage_path) 
WHERE cloudinary_url IS NULL AND storage_path IS NOT NULL;

-- Add index for images with Cloudinary URLs
CREATE INDEX IF NOT EXISTS idx_product_images_cloudinary 
ON product_images(cloudinary_url) 
WHERE cloudinary_url IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN product_images.cloudinary_url IS 'Original/full resolution Cloudinary URL';
COMMENT ON COLUMN product_images.thumbnail_url IS 'Cloudinary 100px thumbnail for search dropdowns';
COMMENT ON COLUMN product_images.card_url IS 'Cloudinary 400px image for product cards';
COMMENT ON COLUMN product_images.detail_url IS 'Cloudinary 800px image for product detail pages';
COMMENT ON COLUMN product_images.cloudinary_public_id IS 'Cloudinary public_id for transformations';

