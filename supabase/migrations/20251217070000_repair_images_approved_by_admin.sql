-- Repair: Ensure images_approved_by_admin column exists
-- This migration is idempotent and can be run multiple times safely

DO $$
BEGIN
    -- Add images_approved_by_admin if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'images_approved_by_admin'
    ) THEN
        ALTER TABLE products ADD COLUMN images_approved_by_admin BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add images_approved_at if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'images_approved_at'
    ) THEN
        ALTER TABLE products ADD COLUMN images_approved_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_products_images_approved_by_admin 
  ON products(images_approved_by_admin) 
  WHERE images_approved_by_admin = TRUE;

-- Add comments
COMMENT ON COLUMN products.images_approved_by_admin IS 'True if product images have been manually approved by an admin';
COMMENT ON COLUMN products.images_approved_at IS 'Timestamp when images were approved by admin';

