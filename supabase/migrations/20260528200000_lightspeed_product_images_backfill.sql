-- ============================================================
-- Lightspeed images -> product_images (the single source of truth)
-- ============================================================
-- Problem: Lightspeed sync writes raw image URLs to products.primary_image_url
-- (and products.images JSONB) but never creates product_images rows. As a
-- result, store-inventory products are only visible in marketplace_ready_products
-- when a canonical image happens to be approved — otherwise they are invisible,
-- even though Lightspeed gave us a usable photo.
--
-- Fix: create approved, PRODUCT-SCOPED product_images rows from the Lightspeed
-- photo. They start as external_url (visible immediately via the resolver's
-- external fallback) and are upgraded to a cloudinary_public_id by
-- migrate-images-to-cloudinary (which already handles approved external_url rows).
--
-- Safety: this is STRICTLY ADDITIVE. A row is created only for products that
-- have NO approved image today (neither product-scoped nor canonical), so it can
-- never override or regress an already-shown / curated image. It is idempotent:
-- once a row exists for a product, the NOT EXISTS guards skip it on re-run.
--
-- Precedence note: marketplace_ready_products ranks product-scoped images above
-- canonical ones. Because we only insert when no canonical image exists, there is
-- no regression now. If, later, a curated canonical image is approved for a
-- product that already has a 'lightspeed' fallback row, the fallback would still
-- win. If you want curation to always beat the raw Lightspeed photo, demote
-- source='lightspeed' below canonical in the view (documented follow-up) — left
-- out here to avoid a hot-path view rewrite that can't be verified offline.
-- ============================================================

CREATE OR REPLACE FUNCTION backfill_lightspeed_product_images()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH candidates AS (
    SELECT p.id AS product_id, p.primary_image_url
    FROM products p
    WHERE p.primary_image_url IS NOT NULL
      AND p.primary_image_url <> ''
      AND p.primary_image_url NOT LIKE 'blob:%'
      AND COALESCE(p.listing_source, 'lightspeed') = 'lightspeed'
      AND p.is_active = TRUE
      -- not already visible via a product-scoped approved image
      AND NOT EXISTS (
        SELECT 1 FROM product_images pi
        WHERE pi.product_id = p.id
          AND pi.approval_status = 'approved'
      )
      -- not already visible via an approved canonical image
      AND NOT EXISTS (
        SELECT 1 FROM product_images pi
        WHERE p.canonical_product_id IS NOT NULL
          AND pi.canonical_product_id = p.canonical_product_id
          AND pi.approval_status = 'approved'
      )
  ), ins AS (
    INSERT INTO product_images (
      product_id, canonical_product_id, external_url, storage_path,
      is_downloaded, is_primary, sort_order, approval_status, source
    )
    SELECT
      c.product_id, NULL, c.primary_image_url, NULL,
      FALSE, TRUE, 0, 'approved', 'lightspeed'
    FROM candidates c
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION backfill_lightspeed_product_images() IS
  'Creates approved product-scoped product_images rows from products.primary_image_url for Lightspeed inventory that has no approved image yet. Strictly additive and idempotent. Called on demand and by migrate-images-to-cloudinary (createFromLightspeed).';

GRANT EXECUTE ON FUNCTION backfill_lightspeed_product_images() TO service_role;

-- Fast lookup for the migrate function: lightspeed rows still needing Cloudinary.
CREATE INDEX IF NOT EXISTS idx_product_images_lightspeed_unmigrated
  ON product_images (id)
  WHERE source = 'lightspeed' AND cloudinary_url IS NULL AND external_url IS NOT NULL;

-- Run once now so existing invisible Lightspeed inventory becomes visible
-- immediately (raw URL); Cloudinary upgrade happens via migrate-images-to-cloudinary.
SELECT backfill_lightspeed_product_images();

-- ============================================================
-- Operate / verify:
--   -- How many Lightspeed fallback rows exist:
--   SELECT count(*) FROM product_images WHERE source = 'lightspeed';
--
--   -- How many still need Cloudinary upgrade (run migrate to drain):
--   SELECT count(*) FROM product_images
--   WHERE source = 'lightspeed' AND cloudinary_url IS NULL;
--
--   -- Upgrade them (repeat until remaining = 0):
--   POST /functions/v1/migrate-images-to-cloudinary
--     { "createFromLightspeed": true, "migrateFromExternal": true,
--       "migrateFromStorage": false, "batchSize": 25 }
-- ============================================================
