-- ============================================================
-- Fix: product_images trigger should NOT overwrite private_listing cached images
-- ============================================================
-- 
-- PROBLEM: When a private listing is created:
-- 1. INSERT into products → update_product_cached_images() runs → sets cached_image_url from JSONB
-- 2. INSERT into product_images (x N images) → refresh_product_cached_image() runs EACH time
--    → OVERWRITES cached_image_url based on product_images table
-- 
-- The product_images trigger was not respecting the listing_type and was overwriting
-- the cached_image_url set by the products trigger.
-- 
-- SOLUTION: Skip private listings in the product_images trigger since they should
-- use the JSONB images array, not the product_images table.
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_product_cached_image()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
  v_canonical_product_id UUID;
  v_image_url TEXT;
  v_thumbnail_url TEXT;
  v_listing_type TEXT;
BEGIN
  -- Get both product_id and canonical_product_id from the changed row
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  v_canonical_product_id := COALESCE(NEW.canonical_product_id, OLD.canonical_product_id);
  
  -- ============================================================
  -- Case 1: Direct product image
  -- SKIP private listings - they use JSONB images, not product_images table
  -- ============================================================
  IF v_product_id IS NOT NULL THEN
    -- Check if this is a private listing
    SELECT listing_type INTO v_listing_type
    FROM products
    WHERE id = v_product_id;
    
    -- SKIP private listings - they manage their own images via JSONB
    IF v_listing_type = 'private_listing' THEN
      RAISE NOTICE 'Skipping refresh_product_cached_image for private_listing %', v_product_id;
      RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- For non-private listings, find the best image for this specific product
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
  -- (already excludes private listings)
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
    -- (already skips private listings)
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

-- ============================================================
-- Refresh private listings to ensure they have correct cached images from JSONB
-- ============================================================

-- Update private listings using their JSONB images array
UPDATE products p
SET 
  cached_image_url = COALESCE(
    -- First try: cardUrl where isPrimary is true
    (SELECT img->>'cardUrl' 
     FROM jsonb_array_elements(p.images::jsonb) AS img 
     WHERE img->>'cardUrl' LIKE '%cloudinary%' 
       AND (img->>'isPrimary')::boolean = true
     LIMIT 1),
    -- Second try: cardUrl ordered by 'order' field (cover photo has order: 0)
    (SELECT img->>'cardUrl' 
     FROM jsonb_array_elements(p.images::jsonb) AS img 
     WHERE img->>'cardUrl' LIKE '%cloudinary%' 
     ORDER BY (img->>'order')::int ASC NULLS LAST
     LIMIT 1),
    -- Third try: url where isPrimary is true
    (SELECT img->>'url' 
     FROM jsonb_array_elements(p.images::jsonb) AS img 
     WHERE img->>'url' LIKE '%cloudinary%' 
       AND (img->>'isPrimary')::boolean = true
     LIMIT 1),
    -- Fourth try: url ordered by 'order' field
    (SELECT img->>'url' 
     FROM jsonb_array_elements(p.images::jsonb) AS img 
     WHERE img->>'url' LIKE '%cloudinary%' 
     ORDER BY (img->>'order')::int ASC NULLS LAST
     LIMIT 1)
  ),
  cached_thumbnail_url = COALESCE(
    -- First try: thumbnailUrl where isPrimary is true
    (SELECT img->>'thumbnailUrl' 
     FROM jsonb_array_elements(p.images::jsonb) AS img 
     WHERE img->>'thumbnailUrl' LIKE '%cloudinary%' 
       AND (img->>'isPrimary')::boolean = true
     LIMIT 1),
    -- Second try: thumbnailUrl ordered by 'order' field
    (SELECT img->>'thumbnailUrl' 
     FROM jsonb_array_elements(p.images::jsonb) AS img 
     WHERE img->>'thumbnailUrl' LIKE '%cloudinary%' 
     ORDER BY (img->>'order')::int ASC NULLS LAST
     LIMIT 1),
    -- Fallback to cardUrl
    (SELECT img->>'cardUrl' 
     FROM jsonb_array_elements(p.images::jsonb) AS img 
     WHERE img->>'cardUrl' LIKE '%cloudinary%' 
     ORDER BY (img->>'order')::int ASC NULLS LAST
     LIMIT 1)
  ),
  has_displayable_image = TRUE
WHERE p.listing_type = 'private_listing'
  AND p.images IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.images::jsonb) AS img 
    WHERE img->>'cardUrl' LIKE '%cloudinary%'
  );

-- Log results
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM products
  WHERE listing_type = 'private_listing'
    AND cached_image_url IS NOT NULL;
  
  RAISE NOTICE '✅ Refreshed % private listings with correct cached images', updated_count;
END $$;

