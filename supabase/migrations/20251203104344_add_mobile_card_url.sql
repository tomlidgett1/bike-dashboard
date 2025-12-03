-- Add mobile_card_url column to product_images table
-- This is a smaller optimised image (200px) for mobile card views
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS mobile_card_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN product_images.mobile_card_url IS 'Cloudinary URL for mobile card view (200px square, fit with auto background)';

