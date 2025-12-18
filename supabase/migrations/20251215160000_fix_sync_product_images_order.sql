-- ============================================================
-- Fix: Sync function must recalculate order based on final array position
-- ============================================================
-- 
-- ROOT CAUSE: The sync_product_images_to_jsonb() function was using sort_order
-- directly from the product_images table. But when reordering images (changing
-- cover photo), the array is sorted by is_primary DESC, sort_order ASC, which
-- puts the primary image first. However, the 'order' field in the JSONB was
-- still using the ORIGINAL sort_order, not the new array position.
-- 
-- EXAMPLE OF THE BUG:
-- - Image A uploaded first: sort_order=0 (Cloudinary URL ends with -0)
-- - Image B uploaded second: sort_order=1 (Cloudinary URL ends with -1)
-- - User changes cover to Image B in Step-1
-- - product_images updated: Image B is_primary=true, Image A is_primary=false
-- - Sync function runs, orders by is_primary DESC:
--   - Array[0] = Image B (is_primary=true) → BUT order was set to 1 (original sort_order)
--   - Array[1] = Image A → order was set to 0 (original sort_order)
-- - Result: order field doesn't match array position!
-- 
-- FIX: Use ROW_NUMBER() to compute the order based on the final sorted position.
-- ============================================================

-- ============================================================
-- Function: Sync product images to JSONB (FIXED)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_product_images_to_jsonb(target_product_id UUID)
RETURNS VOID AS $$
DECLARE
  image_data JSONB;
BEGIN
  -- Build JSONB array from product_images table
  -- FIX: Use ROW_NUMBER() to set 'order' based on final array position
  WITH ordered_images AS (
    SELECT 
      pi.*,
      (ROW_NUMBER() OVER (ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC) - 1)::int as computed_order
    FROM product_images pi
    WHERE pi.product_id = target_product_id
      AND pi.approval_status = 'approved'
      AND (pi.cloudinary_url IS NOT NULL OR pi.card_url IS NOT NULL)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id::text,
        'url', oi.cloudinary_url,
        'thumbnailUrl', oi.thumbnail_url,
        'cardUrl', oi.card_url,
        'mobileCardUrl', oi.mobile_card_url,
        'galleryUrl', oi.gallery_url,
        'detailUrl', oi.detail_url,
        'isPrimary', oi.is_primary,
        'order', oi.computed_order,  -- Use computed order, not original sort_order
        'source', 'product_images'
      ) ORDER BY oi.computed_order
    ),
    '[]'::jsonb
  )
  INTO image_data
  FROM ordered_images oi;

  -- Update products table with synced images
  UPDATE products
  SET images = image_data
  WHERE id = target_product_id;
  
  -- Log for debugging
  RAISE NOTICE 'Synced % images to product %', jsonb_array_length(image_data), target_product_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Sync canonical product images to related products (FIXED)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_canonical_images_to_products(target_canonical_id UUID)
RETURNS VOID AS $$
DECLARE
  image_data JSONB;
  affected_count INTEGER;
BEGIN
  -- Build JSONB array from canonical product images
  -- FIX: Use ROW_NUMBER() to set 'order' based on final array position
  WITH ordered_images AS (
    SELECT 
      pi.*,
      (ROW_NUMBER() OVER (ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC) - 1)::int as computed_order
    FROM product_images pi
    WHERE pi.canonical_product_id = target_canonical_id
      AND pi.approval_status = 'approved'
      AND (pi.cloudinary_url IS NOT NULL OR pi.card_url IS NOT NULL)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id::text,
        'url', oi.cloudinary_url,
        'thumbnailUrl', oi.thumbnail_url,
        'cardUrl', oi.card_url,
        'mobileCardUrl', oi.mobile_card_url,
        'galleryUrl', oi.gallery_url,
        'detailUrl', oi.detail_url,
        'isPrimary', oi.is_primary,
        'order', oi.computed_order,  -- Use computed order, not original sort_order
        'source', 'canonical'
      ) ORDER BY oi.computed_order
    ),
    '[]'::jsonb
  )
  INTO image_data
  FROM ordered_images oi;

  -- Update all products linked to this canonical product
  -- BUT only if they don't already have their own images
  UPDATE products
  SET images = image_data
  WHERE canonical_product_id = target_canonical_id
    AND (images IS NULL OR images = '[]'::jsonb OR jsonb_array_length(images) = 0);
  
  -- Get count of affected rows
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  -- Log for debugging
  RAISE NOTICE 'Synced % canonical images to % products', jsonb_array_length(image_data), affected_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Refresh all private listings to fix the order field
-- ============================================================
DO $$
DECLARE
  product_record RECORD;
  sync_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting resync of private listing images...';
  
  -- Resync all private listings that have images
  FOR product_record IN 
    SELECT DISTINCT p.id
    FROM products p
    INNER JOIN product_images pi ON pi.product_id = p.id
    WHERE p.listing_type = 'private_listing'
      AND pi.approval_status = 'approved'
  LOOP
    PERFORM sync_product_images_to_jsonb(product_record.id);
    sync_count := sync_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ Resynced % private listings with correct order field', sync_count;
END $$;

-- ============================================================
-- Also update the cached_image_url for all resynced products
-- ============================================================
SELECT refresh_all_cached_images();


