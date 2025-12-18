-- ============================================================
-- Fix: Keep products.primary_image_url in sync with product_images (and JSONB)
-- ============================================================
--
-- We already sync product_images -> products.images JSONB for performance.
-- But primary_image_url is still used across the app (messages, offers, etc).
-- If primary_image_url is stale, the UI appears "not working" even when
-- cached_image_url and images JSONB are correct.
--
-- This migration:
-- 1) Updates sync_product_images_to_jsonb() to ALSO set products.primary_image_url
--    to the first image after ordering (primary-first).
-- 2) Updates sync_canonical_images_to_products() similarly.
-- 3) Backfills primary_image_url for existing private listings.
-- ============================================================

-- ============================================================
-- Function: Sync product images to JSONB (also sets primary_image_url)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_product_images_to_jsonb(target_product_id UUID)
RETURNS VOID AS $$
DECLARE
  image_data JSONB;
  v_primary_url TEXT;
BEGIN
  -- Build JSONB array from product_images table
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
        'order', oi.computed_order,
        'source', 'product_images'
      ) ORDER BY oi.computed_order
    ),
    '[]'::jsonb
  )
  INTO image_data
  FROM ordered_images oi;

  -- Compute primary URL from the first element (prefer cardUrl)
  v_primary_url := COALESCE(image_data->0->>'cardUrl', image_data->0->>'url');

  -- Update products table with synced images + primary_image_url
  UPDATE products
  SET 
    images = image_data,
    primary_image_url = v_primary_url
  WHERE id = target_product_id;
  
  RAISE NOTICE 'Synced % images to product %', jsonb_array_length(image_data), target_product_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Sync canonical product images to related products (also sets primary_image_url)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_canonical_images_to_products(target_canonical_id UUID)
RETURNS VOID AS $$
DECLARE
  image_data JSONB;
  affected_count INTEGER;
  v_primary_url TEXT;
BEGIN
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
        'order', oi.computed_order,
        'source', 'canonical'
      ) ORDER BY oi.computed_order
    ),
    '[]'::jsonb
  )
  INTO image_data
  FROM ordered_images oi;

  v_primary_url := COALESCE(image_data->0->>'cardUrl', image_data->0->>'url');

  UPDATE products
  SET 
    images = image_data,
    primary_image_url = v_primary_url
  WHERE canonical_product_id = target_canonical_id
    AND (images IS NULL OR images = '[]'::jsonb OR jsonb_array_length(images) = 0);
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Synced % canonical images to % products', jsonb_array_length(image_data), affected_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Backfill: Fix primary_image_url for private listings
-- ============================================================
UPDATE products p
SET primary_image_url = COALESCE(
  -- Prefer cardUrl for primary
  (SELECT img->>'cardUrl'
   FROM jsonb_array_elements(p.images::jsonb) AS img
   WHERE (img->>'isPrimary')::boolean = true
   LIMIT 1),
  (SELECT img->>'cardUrl'
   FROM jsonb_array_elements(p.images::jsonb) AS img
   ORDER BY (img->>'order')::int ASC NULLS LAST
   LIMIT 1),
  -- Fallback to url
  (SELECT img->>'url'
   FROM jsonb_array_elements(p.images::jsonb) AS img
   WHERE (img->>'isPrimary')::boolean = true
   LIMIT 1),
  (SELECT img->>'url'
   FROM jsonb_array_elements(p.images::jsonb) AS img
   ORDER BY (img->>'order')::int ASC NULLS LAST
   LIMIT 1)
)
WHERE p.listing_type = 'private_listing'
  AND p.images IS NOT NULL
  AND jsonb_typeof(p.images::jsonb) = 'array'
  AND jsonb_array_length(p.images::jsonb) > 0;



