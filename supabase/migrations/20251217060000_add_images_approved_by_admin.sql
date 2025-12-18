-- ============================================================
-- Add images_approved_by_admin column to products table
-- ============================================================
-- Tracks which products have had their images manually approved
-- by an admin (for products that don't need AI processing)

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS images_approved_by_admin BOOLEAN DEFAULT FALSE;

-- Add timestamp for when approval happened
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS images_approved_at TIMESTAMPTZ;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_products_images_approved_by_admin 
  ON products(images_approved_by_admin) 
  WHERE images_approved_by_admin = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN products.images_approved_by_admin IS 'True if product images have been manually approved by an admin';
COMMENT ON COLUMN products.images_approved_at IS 'Timestamp when images were approved by admin';


