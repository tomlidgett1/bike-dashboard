-- ============================================================
-- Fix: update_product_cached_images() and refresh_all_cached_images()
-- ============================================================
-- The 20260528230000 column drop removed card_url, thumbnail_url,
-- gallery_url, detail_url, mobile_card_url from product_images.
-- These two functions still referenced pi.card_url / pi.thumbnail_url
-- in their canonical-product queries.
--
-- update_product_cached_images():
--   Called by trg_update_product_cached_images (BEFORE trigger on products
--   for UPDATE OF images, use_custom_image, custom_image_url,
--   canonical_product_id, listing_type). Not hit by the auto-pilot save
--   path but fires on any listing/catalog management operation.
--
-- refresh_all_cached_images():
--   Manual batch-refresh utility. Same fix needed.
--
-- Fix: replace COALESCE(pi.card_url, pi.cloudinary_url) with
-- COALESCE(pi.cloudinary_url, pi.external_url) everywhere.
-- ============================================================

CREATE OR REPLACE FUNCTION update_product_cached_images()
RETURNS TRIGGER AS $$
DECLARE
  v_image_url TEXT := NULL;
  v_thumbnail_url TEXT := NULL;
  v_has_image BOOLEAN := FALSE;
BEGIN
  -- Priority 1: Private listing images with Cloudinary (via JSONB)
  IF NEW.listing_type = 'private_listing' AND NEW.images IS NOT NULL THEN
    SELECT
      COALESCE(
        (SELECT img->>'cardUrl'
         FROM jsonb_array_elements(NEW.images::jsonb) AS img
         WHERE img->>'cardUrl' LIKE '%cloudinary%'
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        (SELECT img->>'cardUrl'
         FROM jsonb_array_elements(NEW.images::jsonb) AS img
         WHERE img->>'cardUrl' LIKE '%cloudinary%'
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        (SELECT img->>'url'
         FROM jsonb_array_elements(NEW.images::jsonb) AS img
         WHERE img->>'url' LIKE '%cloudinary%'
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        (SELECT img->>'url'
         FROM jsonb_array_elements(NEW.images::jsonb) AS img
         WHERE img->>'url' LIKE '%cloudinary%'
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        NEW.primary_image_url
      )
    INTO v_image_url;

    SELECT
      COALESCE(
        (SELECT img->>'thumbnailUrl'
         FROM jsonb_array_elements(NEW.images::jsonb) AS img
         WHERE img->>'thumbnailUrl' LIKE '%cloudinary%'
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        (SELECT img->>'thumbnailUrl'
         FROM jsonb_array_elements(NEW.images::jsonb) AS img
         WHERE img->>'thumbnailUrl' LIKE '%cloudinary%'
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        v_image_url
      )
    INTO v_thumbnail_url;

    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
    END IF;

  -- Priority 2: Custom store image
  ELSIF NEW.use_custom_image = TRUE AND NEW.custom_image_url IS NOT NULL THEN
    IF NEW.custom_image_url LIKE '%cloudinary%' THEN
      v_image_url      := NEW.custom_image_url;
      v_thumbnail_url  := NEW.custom_image_url;
      v_has_image      := TRUE;
    END IF;

  -- Priority 3: Canonical product images from product_images table.
  -- Use cloudinary_url; fall back to external_url (raw Serper/web URL).
  ELSIF NEW.canonical_product_id IS NOT NULL THEN
    SELECT
      COALESCE(pi.cloudinary_url, pi.external_url),
      COALESCE(pi.cloudinary_url, pi.external_url)
    INTO v_image_url, v_thumbnail_url
    FROM product_images pi
    WHERE pi.canonical_product_id = NEW.canonical_product_id
      AND pi.is_primary = TRUE
      AND pi.approval_status = 'approved'
      AND (pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
    LIMIT 1;

    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
    END IF;
  END IF;

  NEW.cached_image_url     := v_image_url;
  NEW.cached_thumbnail_url := v_thumbnail_url;
  NEW.has_displayable_image := v_has_image;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Batch refresh utility
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_all_cached_images()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Private listings: derive from JSONB images array
  WITH updated AS (
    UPDATE products p
    SET
      cached_image_url = COALESCE(
        (SELECT img->>'cardUrl'
         FROM jsonb_array_elements(p.images::jsonb) AS img
         WHERE img->>'cardUrl' LIKE '%cloudinary%'
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        (SELECT img->>'cardUrl'
         FROM jsonb_array_elements(p.images::jsonb) AS img
         WHERE img->>'cardUrl' LIKE '%cloudinary%'
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        (SELECT img->>'url'
         FROM jsonb_array_elements(p.images::jsonb) AS img
         WHERE img->>'url' LIKE '%cloudinary%'
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        (SELECT img->>'url'
         FROM jsonb_array_elements(p.images::jsonb) AS img
         WHERE img->>'url' LIKE '%cloudinary%'
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1)
      ),
      cached_thumbnail_url = COALESCE(
        (SELECT img->>'thumbnailUrl'
         FROM jsonb_array_elements(p.images::jsonb) AS img
         WHERE img->>'thumbnailUrl' LIKE '%cloudinary%'
           AND (img->>'isPrimary')::boolean = true
         LIMIT 1),
        (SELECT img->>'thumbnailUrl'
         FROM jsonb_array_elements(p.images::jsonb) AS img
         WHERE img->>'thumbnailUrl' LIKE '%cloudinary%'
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
        (SELECT img->>'cardUrl'
         FROM jsonb_array_elements(p.images::jsonb) AS img
         WHERE img->>'cardUrl' LIKE '%cloudinary%'
         ORDER BY (img->>'order')::int ASC NULLS LAST
         LIMIT 1),
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

  -- Products with custom store images
  WITH updated AS (
    UPDATE products
    SET
      cached_image_url     = custom_image_url,
      cached_thumbnail_url = custom_image_url,
      has_displayable_image = TRUE
    WHERE use_custom_image = TRUE
      AND custom_image_url LIKE '%cloudinary%'
      AND (listing_type IS NULL OR listing_type != 'private_listing')
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;

  -- Products with canonical product images — use cloudinary_url, fall back to external_url
  WITH updated AS (
    UPDATE products p
    SET
      cached_image_url     = COALESCE(pi.cloudinary_url, pi.external_url),
      cached_thumbnail_url = COALESCE(pi.cloudinary_url, pi.external_url),
      has_displayable_image = TRUE
    FROM product_images pi
    WHERE p.canonical_product_id = pi.canonical_product_id
      AND pi.is_primary = TRUE
      AND pi.approval_status = 'approved'
      AND (pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
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
