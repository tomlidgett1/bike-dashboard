-- ============================================================
-- Add Migration Tracking Columns to product_images
-- Tracks failed migration attempts to avoid infinite retry loops
-- ============================================================

-- Add migration attempt tracking
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS migration_attempts INTEGER DEFAULT 0;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS migration_error TEXT;

-- Index for quickly finding images that need migration (excluding failed ones)
CREATE INDEX IF NOT EXISTS idx_product_images_migration_pending 
ON product_images(migration_attempts) 
WHERE cloudinary_url IS NULL AND (migration_attempts IS NULL OR migration_attempts < 3);

-- Comment on columns
COMMENT ON COLUMN product_images.migration_attempts IS 'Number of times migration to Cloudinary has been attempted';
COMMENT ON COLUMN product_images.migration_error IS 'Last error message from migration attempt';

