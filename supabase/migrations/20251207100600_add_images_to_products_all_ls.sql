-- Add images column to products_all_ls table
ALTER TABLE products_all_ls 
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS primary_image_url TEXT;

COMMENT ON COLUMN products_all_ls.images IS 'Array of image objects from Lightspeed';
COMMENT ON COLUMN products_all_ls.primary_image_url IS 'Primary image URL for quick access';

