-- Add source column to product_images table
-- This column tracks where the image came from (listing_upload, bulk_upload, admin_search, etc.)

ALTER TABLE product_images 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown';

-- Add index for filtering by source
CREATE INDEX IF NOT EXISTS idx_product_images_source ON product_images(source);

COMMENT ON COLUMN product_images.source IS 'The origin of the image: listing_upload, bulk_upload, admin_search, facebook_import, etc.';
