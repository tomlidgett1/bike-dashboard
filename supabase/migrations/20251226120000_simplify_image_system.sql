-- ============================================================
-- Image System Simplification Migration
-- 
-- This migration removes the complex sync triggers and establishes
-- product_images table as the single source of truth for all images.
--
-- Changes:
-- 1. Drop sync triggers (were causing data inconsistencies)
-- 2. Create optimized view for fast primary image lookups
-- 3. Keep columns temporarily for backwards compatibility
-- ============================================================

-- ============================================================
-- Step 1: Drop Sync Triggers
-- These triggers were syncing product_images -> products.images JSONB
-- but caused race conditions and data inconsistencies
-- ============================================================

-- Drop the main trigger that syncs on every product_images change
DROP TRIGGER IF EXISTS trigger_sync_product_images_after_change ON product_images;

-- Drop the trigger function (now obsolete)
DROP FUNCTION IF EXISTS trigger_sync_product_images() CASCADE;

-- Note: Keep the sync functions for now in case we need manual syncing
-- They can be dropped later after verification:
-- DROP FUNCTION IF EXISTS sync_product_images_to_jsonb(UUID);
-- DROP FUNCTION IF EXISTS sync_canonical_images_to_products(UUID);

COMMENT ON FUNCTION sync_product_images_to_jsonb IS 'DEPRECATED: No longer called automatically. Kept for manual use if needed.';
COMMENT ON FUNCTION sync_canonical_images_to_products IS 'DEPRECATED: No longer called automatically. Kept for manual use if needed.';

-- ============================================================
-- Step 2: Create Optimized View for Primary Image Lookups
-- This replaces the cached columns with a fast, consistent view
-- ============================================================

-- View for fast primary image lookups
-- Used by product listings and search results
CREATE OR REPLACE VIEW products_with_primary_image AS
SELECT 
  p.id as product_id,
  p.canonical_product_id,
  -- Primary image from product_images table
  COALESCE(
    pi_product.card_url,
    pi_canonical.card_url
  ) as primary_card_url,
  COALESCE(
    pi_product.thumbnail_url,
    pi_canonical.thumbnail_url
  ) as primary_thumbnail_url,
  COALESCE(
    pi_product.gallery_url,
    pi_canonical.gallery_url
  ) as primary_gallery_url,
  COALESCE(
    pi_product.detail_url,
    pi_canonical.detail_url
  ) as primary_detail_url,
  COALESCE(
    pi_product.cloudinary_url,
    pi_canonical.cloudinary_url
  ) as primary_cloudinary_url,
  -- Check if product has any images
  (pi_product.id IS NOT NULL OR pi_canonical.id IS NOT NULL) as has_images
FROM products p
-- Left join to get primary image by product_id
LEFT JOIN LATERAL (
  SELECT 
    id, card_url, thumbnail_url, gallery_url, detail_url, cloudinary_url
  FROM product_images
  WHERE product_id = p.id
    AND approval_status = 'approved'
  ORDER BY is_primary DESC NULLS LAST, sort_order ASC
  LIMIT 1
) pi_product ON true
-- Left join to get primary image by canonical_product_id (fallback)
LEFT JOIN LATERAL (
  SELECT 
    id, card_url, thumbnail_url, gallery_url, detail_url, cloudinary_url
  FROM product_images
  WHERE canonical_product_id = p.canonical_product_id
    AND p.canonical_product_id IS NOT NULL
    AND pi_product.id IS NULL  -- Only use canonical if no direct product image
    AND approval_status = 'approved'
  ORDER BY is_primary DESC NULLS LAST, sort_order ASC
  LIMIT 1
) pi_canonical ON true;

COMMENT ON VIEW products_with_primary_image IS 'Fast lookup for primary product images - uses product_images table as source of truth';

-- ============================================================
-- Step 3: Create Indexes for Optimized Image Queries
-- ============================================================

-- Ensure we have good indexes for the view queries
CREATE INDEX IF NOT EXISTS idx_product_images_product_primary 
ON product_images (product_id, is_primary DESC, sort_order ASC) 
WHERE approval_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_product_images_canonical_primary 
ON product_images (canonical_product_id, is_primary DESC, sort_order ASC) 
WHERE approval_status = 'approved' AND canonical_product_id IS NOT NULL;

-- ============================================================
-- Step 4: Grant Access to the View
-- ============================================================

GRANT SELECT ON products_with_primary_image TO authenticated;
GRANT SELECT ON products_with_primary_image TO anon;

-- ============================================================
-- Documentation
-- ============================================================

/*
MIGRATION SUMMARY:
==================

This migration simplifies the image system by:

1. REMOVED: Automatic sync triggers from product_images -> products.images JSONB
   - These were causing race conditions and data inconsistencies
   - Images are now ONLY stored in product_images table

2. ADDED: products_with_primary_image view
   - Provides fast, consistent access to primary images
   - Uses product_images as the single source of truth
   - Falls back to canonical_product_id images when no direct product images exist

3. KEPT (for now): cached_image_url, cached_thumbnail_url, primary_image_url, images columns
   - These are kept for backwards compatibility during transition
   - Will be dropped in a future migration after verifying everything works

ROLLBACK:
=========
To rollback this migration:

1. Recreate the trigger:
   CREATE TRIGGER trigger_sync_product_images_after_change
   AFTER INSERT OR UPDATE OR DELETE ON product_images
   FOR EACH ROW
   EXECUTE FUNCTION trigger_sync_product_images();

2. Drop the view:
   DROP VIEW IF EXISTS products_with_primary_image;

NEXT STEPS (Future Migration):
==============================
After verifying the application works correctly:

1. DROP columns from products table:
   - images (JSONB)
   - cached_image_url
   - cached_thumbnail_url
   - primary_image_url
   - has_displayable_image

2. DROP the now-unused sync functions:
   - sync_product_images_to_jsonb
   - sync_canonical_images_to_products
*/

