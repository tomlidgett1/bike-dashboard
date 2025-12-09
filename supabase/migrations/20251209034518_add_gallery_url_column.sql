-- ============================================================
-- Add gallery_url Column to product_images
-- Gallery variant (1200px, 4:3 aspect, padded) for product detail pages
-- Provides full product visibility without cropping
-- ============================================================

-- Add gallery_url column
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS gallery_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_images_gallery_url 
ON product_images(gallery_url) 
WHERE gallery_url IS NOT NULL;

-- Comment on column for documentation
COMMENT ON COLUMN product_images.gallery_url IS 'Cloudinary 1200px landscape image (4:3 aspect, padded) for product detail page galleries - preserves full product without cropping';

