-- ============================================================
-- Fix: update_products_on_image_change() trigger
-- ============================================================
-- Migration 20260528230000 dropped card_url, thumbnail_url, gallery_url,
-- detail_url, mobile_card_url from product_images. That migration rewrote
-- refresh_product_cached_image() but missed the older trigger function
-- update_products_on_image_change() (created in 20251202120000), which
-- still references NEW.card_url / pi.card_url etc.
--
-- Every INSERT/UPDATE/DELETE on product_images was failing with:
--   ERROR: record "new" has no field "card_url"
--
-- Fix: replace all card_url/thumbnail_url references with
-- COALESCE(cloudinary_url, external_url) — the new single source of truth.
-- ============================================================

CREATE OR REPLACE FUNCTION update_products_on_image_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When a product_image is inserted, updated, or deleted, refresh the related products
  IF TG_OP = 'DELETE' THEN
    UPDATE products p
    SET
      cached_image_url = (
        SELECT COALESCE(pi.cloudinary_url, pi.external_url)
        FROM product_images pi
        WHERE pi.canonical_product_id = OLD.canonical_product_id
          AND pi.is_primary = TRUE
          AND pi.approval_status = 'approved'
          AND (pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
        LIMIT 1
      ),
      cached_thumbnail_url = (
        SELECT COALESCE(pi.cloudinary_url, pi.external_url)
        FROM product_images pi
        WHERE pi.canonical_product_id = OLD.canonical_product_id
          AND pi.is_primary = TRUE
          AND pi.approval_status = 'approved'
          AND (pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
        LIMIT 1
      ),
      has_displayable_image = EXISTS (
        SELECT 1 FROM product_images pi
        WHERE pi.canonical_product_id = OLD.canonical_product_id
          AND pi.is_primary = TRUE
          AND pi.approval_status = 'approved'
          AND (pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
      )
    WHERE p.canonical_product_id = OLD.canonical_product_id
      AND p.use_custom_image = FALSE
      AND (p.listing_type IS NULL OR p.listing_type != 'private_listing');
    RETURN OLD;
  ELSE
    -- INSERT or UPDATE: update linked products when this image is the
    -- approved primary and has a usable URL.
    UPDATE products p
    SET
      cached_image_url      = COALESCE(NEW.cloudinary_url, NEW.external_url),
      cached_thumbnail_url  = COALESCE(NEW.cloudinary_url, NEW.external_url),
      has_displayable_image = TRUE
    WHERE p.canonical_product_id = NEW.canonical_product_id
      AND p.use_custom_image = FALSE
      AND (p.listing_type IS NULL OR p.listing_type != 'private_listing')
      AND NEW.is_primary = TRUE
      AND NEW.approval_status = 'approved'
      AND (NEW.cloudinary_url IS NOT NULL OR NEW.external_url IS NOT NULL);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
