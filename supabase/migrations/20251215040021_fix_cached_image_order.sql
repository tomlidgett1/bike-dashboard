-- ============================================================
-- Fix: Cached Image Selection Must Respect Order Field
-- ============================================================
-- When selecting the cached image URL from the images JSONB array,
-- the fallback logic was using LIMIT 1 without ORDER BY, which
-- could pick any image instead of the cover photo (order: 0).
-- 
-- This fix ensures we always select the image with the lowest
-- order value when isPrimary is not found.
-- ============================================================

-- ============================================================
-- Step 1: Update the trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_product_cached_images()
RETURNS TRIGGER AS $$
DECLARE
  v_image_url TEXT := NULL;
  v_thumbnail_url TEXT := NULL;
  v_has_image BOOLEAN := FALSE;
BEGIN
  -- Priority 1: Private listing images with Cloudinary
  IF NEW.listing_type = 'private_listing' AND NEW.images IS NOT NULL THEN
    -- Check if any image has cloudinary URL - prefer cardUrl (square crop) over url
    -- FIXED: Now properly orders by the 'order' field to get cover photo
    SELECT 
      COALESCE(
        -- First try: cardUrl where isPrimary is explicitly true
        (SELECT img->>'cardUrl' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'cardUrl' LIKE '%cloudinary%' 
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        -- Second try: cardUrl ordered by 'order' field (cover photo has order: 0)
        (SELECT img->>'cardUrl' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'cardUrl' LIKE '%cloudinary%' 
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        -- Third try: url where isPrimary is true
        (SELECT img->>'url' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'url' LIKE '%cloudinary%' 
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        -- Fourth try: url ordered by 'order' field
        (SELECT img->>'url' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'url' LIKE '%cloudinary%' 
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        -- Fifth try: primary image url field on the product
        NEW.primary_image_url
      )
    INTO v_image_url;
    
    -- Get thumbnail URL (prefer thumbnailUrl from the cover photo)
    SELECT 
      COALESCE(
        -- First try: thumbnailUrl where isPrimary is true
        (SELECT img->>'thumbnailUrl' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'thumbnailUrl' LIKE '%cloudinary%' 
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        -- Second try: thumbnailUrl ordered by 'order' field
        (SELECT img->>'thumbnailUrl' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'thumbnailUrl' LIKE '%cloudinary%' 
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        -- Fallback to the image URL
        v_image_url
      )
    INTO v_thumbnail_url;
    
    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
    END IF;
  
  -- Priority 2: Custom store image with Cloudinary
  ELSIF NEW.use_custom_image = TRUE AND NEW.custom_image_url IS NOT NULL THEN
    IF NEW.custom_image_url LIKE '%cloudinary%' THEN
      v_image_url := NEW.custom_image_url;
      v_thumbnail_url := NEW.custom_image_url;
      v_has_image := TRUE;
    END IF;
  
  -- Priority 3: Canonical product images (check product_images table)
  ELSIF NEW.canonical_product_id IS NOT NULL THEN
    SELECT 
      COALESCE(pi.card_url, pi.cloudinary_url),
      COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
    INTO v_image_url, v_thumbnail_url
    FROM product_images pi
    WHERE pi.canonical_product_id = NEW.canonical_product_id
      AND pi.is_primary = TRUE
      AND pi.approval_status = 'approved'
      AND pi.cloudinary_url IS NOT NULL
    LIMIT 1;
    
    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
    END IF;
  END IF;
  
  -- Update the cached columns
  NEW.cached_image_url := v_image_url;
  NEW.cached_thumbnail_url := v_thumbnail_url;
  NEW.has_displayable_image := v_has_image;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 2: Update the batch refresh function
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_all_cached_images()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update products with private listing images - prefer cardUrl, order by 'order' field
  WITH updated AS (
    UPDATE products p
    SET 
      cached_image_url = COALESCE(
        -- First try: cardUrl where isPrimary is true
        (SELECT img->>'cardUrl' 
         FROM jsonb_array_elements(p.images::jsonb) AS img 
         WHERE img->>'cardUrl' LIKE '%cloudinary%' 
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        -- Second try: cardUrl ordered by 'order' field (cover photo)
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
         LIMIT 1),
        -- Fallback to url
        (SELECT img->>'url' 
         FROM jsonb_array_elements(p.images::jsonb) AS img 
         WHERE img->>'url' LIKE '%cloudinary%' 
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1)
      ),
      has_displayable_image = TRUE
    WHERE p.listing_type = 'private_listing'
      AND p.images IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.images::jsonb) AS img 
        WHERE img->>'url' LIKE '%cloudinary%' OR img->>'cardUrl' LIKE '%cloudinary%'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  -- Update products with custom store images
  WITH updated AS (
    UPDATE products
    SET 
      cached_image_url = custom_image_url,
      cached_thumbnail_url = custom_image_url,
      has_displayable_image = TRUE
    WHERE use_custom_image = TRUE
      AND custom_image_url LIKE '%cloudinary%'
      AND (listing_type IS NULL OR listing_type != 'private_listing')
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;
  
  -- Update products with canonical product images
  WITH updated AS (
    UPDATE products p
    SET 
      cached_image_url = COALESCE(pi.card_url, pi.cloudinary_url),
      cached_thumbnail_url = COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url),
      has_displayable_image = TRUE
    FROM product_images pi
    WHERE p.canonical_product_id = pi.canonical_product_id
      AND pi.is_primary = TRUE
      AND pi.approval_status = 'approved'
      AND pi.cloudinary_url IS NOT NULL
      AND p.use_custom_image = FALSE
      AND (p.listing_type IS NULL OR p.listing_type != 'private_listing')
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;
  
  -- Mark products without displayable images
  UPDATE products
  SET has_displayable_image = FALSE
  WHERE cached_image_url IS NULL;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 3: Refresh all existing cached images to use correct order
-- ============================================================

SELECT refresh_all_cached_images();

