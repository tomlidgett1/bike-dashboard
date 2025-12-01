-- ============================================================
-- Add External URL Tracking for Fast Image Discovery
-- ============================================================
-- Allows showing images immediately without downloading first
-- Downloads happen only when user approves the image

-- Add columns to track external URLs and download status
ALTER TABLE product_images 
ADD COLUMN IF NOT EXISTS external_url TEXT,
ADD COLUMN IF NOT EXISTS is_downloaded BOOLEAN DEFAULT true;

-- Existing images already have storage_path, so they default to is_downloaded=true
-- No need to update them explicitly

-- Add index for querying pending downloads
CREATE INDEX IF NOT EXISTS idx_product_images_pending_download
  ON product_images(canonical_product_id, is_downloaded, approval_status)
  WHERE is_downloaded = false AND approval_status = 'approved';

-- Add comments
COMMENT ON COLUMN product_images.external_url IS 'External URL for images not yet downloaded to Supabase Storage. Used for fast preview in QA workflow.';
COMMENT ON COLUMN product_images.is_downloaded IS 'True if image has been downloaded to Supabase Storage, false if only external URL exists';

