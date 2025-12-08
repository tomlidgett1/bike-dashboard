-- ============================================================
-- Fix: Update cached_image_url when canonical product images change
-- ============================================================
-- 
-- PROBLEM: When admin sets primary image in Image QA for canonical products,
-- the cached_image_url in products table is not updated.
-- 
-- ROOT CAUSE: The refresh_product_cached_image() trigger function only
-- handles product_id changes, not canonical_product_id changes.
-- 
-- SOLUTION: Update the trigger to handle both cases:
-- 1. Direct product images (product_id)
-- 2. Canonical product images (canonical_product_id) - update ALL products
--    that reference this canonical product
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_product_cached_image()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
  v_canonical_product_id UUID;
  v_image_url TEXT;
  v_thumbnail_url TEXT;
BEGIN
  -- Get both product_id and canonical_product_id from the changed row
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  v_canonical_product_id := COALESCE(NEW.canonical_product_id, OLD.canonical_product_id);
  
  -- ============================================================
  -- Case 1: Direct product image (private listing)
  -- ============================================================
  IF v_product_id IS NOT NULL THEN
    -- Find the best image for this specific product
    SELECT 
      COALESCE(pi.card_url, pi.cloudinary_url, pi.external_url),
      COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
    INTO v_image_url, v_thumbnail_url
    FROM product_images pi
    WHERE pi.product_id = v_product_id
      AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
    ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
    LIMIT 1;
    
    -- Update this specific product's cached image columns
    UPDATE products
    SET 
      cached_image_url = v_image_url,
      cached_thumbnail_url = v_thumbnail_url,
      has_displayable_image = (v_image_url IS NOT NULL)
    WHERE id = v_product_id;
  END IF;
  
  -- ============================================================
  -- Case 2: Canonical product image (store inventory)
  -- Update ALL products that reference this canonical product
  -- ============================================================
  IF v_canonical_product_id IS NOT NULL THEN
    -- Find the best image for this canonical product
    SELECT 
      COALESCE(pi.card_url, pi.cloudinary_url, pi.external_url),
      COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
    INTO v_image_url, v_thumbnail_url
    FROM product_images pi
    WHERE pi.canonical_product_id = v_canonical_product_id
      AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
    ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
    LIMIT 1;
    
    -- Update ALL products that reference this canonical product
    UPDATE products
    SET 
      cached_image_url = v_image_url,
      cached_thumbnail_url = v_thumbnail_url,
      has_displayable_image = (v_image_url IS NOT NULL)
    WHERE canonical_product_id = v_canonical_product_id
      AND use_custom_image = FALSE
      AND (listing_type IS NULL OR listing_type != 'private_listing');
    
    RAISE NOTICE 'Updated cached images for canonical product % (affected % products)', 
      v_canonical_product_id, 
      (SELECT COUNT(*) FROM products WHERE canonical_product_id = v_canonical_product_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (no change needed, just for clarity)
DROP TRIGGER IF EXISTS refresh_product_image_on_change ON product_images;
CREATE TRIGGER refresh_product_image_on_change
  AFTER INSERT OR UPDATE OR DELETE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION refresh_product_cached_image();

-- ============================================================
-- Backfill: Update all existing products with correct cached images
-- ============================================================

-- Update products with canonical product images (priority order: primary, then first approved)
WITH canonical_images AS (
  SELECT DISTINCT ON (pi.canonical_product_id)
    pi.canonical_product_id,
    COALESCE(pi.card_url, pi.cloudinary_url, pi.external_url) as image_url,
    COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url) as thumbnail_url
  FROM product_images pi
  WHERE pi.canonical_product_id IS NOT NULL
    AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
    AND (pi.card_url IS NOT NULL OR pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
  ORDER BY 
    pi.canonical_product_id, 
    pi.is_primary DESC NULLS LAST,
    pi.sort_order ASC NULLS LAST,
    pi.created_at ASC
)
UPDATE products p
SET 
  cached_image_url = ci.image_url,
  cached_thumbnail_url = ci.thumbnail_url,
  has_displayable_image = TRUE
FROM canonical_images ci
WHERE p.canonical_product_id = ci.canonical_product_id
  AND p.use_custom_image = FALSE
  AND (p.listing_type IS NULL OR p.listing_type != 'private_listing');

-- Log the results
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM products p
  WHERE p.cached_image_url IS NOT NULL
    AND p.canonical_product_id IS NOT NULL;
    
  RAISE NOTICE '✅ Backfill complete: % products now have cached images from canonical products', updated_count;
END $$;

