-- ============================================================
-- Make storage_path Nullable for Fast Image Discovery
-- ============================================================
-- Allows saving external URLs without downloading first

-- Make storage_path nullable (was NOT NULL before)
ALTER TABLE product_images 
ALTER COLUMN storage_path DROP NOT NULL;

-- Add constraint: must have either storage_path OR external_url
ALTER TABLE product_images
ADD CONSTRAINT check_has_image_source 
CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL);

COMMENT ON CONSTRAINT check_has_image_source ON product_images 
IS 'Ensures every image has either a storage_path (downloaded) or external_url (not downloaded yet)';










