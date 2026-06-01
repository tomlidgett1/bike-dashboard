-- ============================================================
-- Demote lightspeed backfill images below canonical
-- ============================================================
-- The backfill_lightspeed_product_images() function creates
-- product-scoped images (source='lightspeed') as a visibility
-- fallback for Lightspeed products that had no approved image.
-- These were strictly-additive at insertion time, but once a
-- curated serper_workbench canonical image is approved the
-- lightspeed backfill row still wins the COALESCE because
-- product-scoped images rank above canonical ones.
--
-- Fix: split the product_image lateral into two:
--   product_image_curated  – non-lightspeed product-scoped images
--                            (manual uploads, etc.) keep their
--                            high-priority position.
--   lightspeed_fallback    – lightspeed backfill rows drop to last
--                            resort, after all canonical images.
--
-- New COALESCE order:
--   selected > curated-product > canonical_primary > canonical_any
--   > lightspeed_fallback
-- ============================================================

DROP VIEW IF EXISTS marketplace_ready_products;

CREATE VIEW marketplace_ready_products
WITH (security_invoker = true)
AS
WITH resolved AS (
  SELECT
    p.*,
    COALESCE(
      selected_image.id,
      product_image_curated.id,
      canonical_primary.id,
      canonical_any.id,
      lightspeed_fallback.id
    ) AS resolved_image_id,
    CASE
      WHEN selected_image.id          IS NOT NULL THEN 'selected'
      WHEN product_image_curated.id   IS NOT NULL THEN 'product'
      WHEN canonical_primary.id       IS NOT NULL THEN 'canonical_primary'
      WHEN canonical_any.id           IS NOT NULL THEN 'canonical_any'
      WHEN lightspeed_fallback.id     IS NOT NULL THEN 'lightspeed_fallback'
      ELSE 'none'
    END AS resolved_image_source,
    COALESCE(
      selected_image.cloudinary_public_id,
      product_image_curated.cloudinary_public_id,
      canonical_primary.cloudinary_public_id,
      canonical_any.cloudinary_public_id,
      lightspeed_fallback.cloudinary_public_id
    ) AS resolved_cloudinary_public_id,
    COALESCE(
      selected_image.cloudinary_url,
      product_image_curated.cloudinary_url,
      canonical_primary.cloudinary_url,
      canonical_any.cloudinary_url,
      lightspeed_fallback.cloudinary_url
    ) AS resolved_cloudinary_url,
    COALESCE(
      selected_image.external_url,
      product_image_curated.external_url,
      canonical_primary.external_url,
      canonical_any.external_url,
      lightspeed_fallback.external_url
    ) AS resolved_external_url,
    COALESCE(
      selected_image.source,
      product_image_curated.source,
      canonical_primary.source,
      canonical_any.source,
      lightspeed_fallback.source
    ) AS resolved_image_provider

  FROM products p

  -- 1. Explicitly-selected image (highest priority)
  LEFT JOIN product_images selected_image
    ON selected_image.id = p.selected_product_image_id
    AND selected_image.approval_status = 'approved'
    AND (
      selected_image.product_id = p.id
      OR selected_image.canonical_product_id = p.canonical_product_id
    )

  -- 2. Curated product-scoped images (manual uploads, etc.)
  --    Lightspeed backfill rows (source='lightspeed') are excluded here
  --    so curated canonical images take priority over them.
  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.product_id = p.id
      AND pi.approval_status = 'approved'
      AND (pi.source IS NULL OR pi.source != 'lightspeed')
    ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) product_image_curated ON TRUE

  -- 3. Canonical primary image (is_primary = TRUE)
  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.canonical_product_id = p.canonical_product_id
      AND p.canonical_product_id IS NOT NULL
      AND pi.approval_status = 'approved'
      AND pi.is_primary = TRUE
    ORDER BY pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) canonical_primary ON TRUE

  -- 4. Any canonical image (fallback when none is marked primary)
  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.canonical_product_id = p.canonical_product_id
      AND p.canonical_product_id IS NOT NULL
      AND pi.approval_status = 'approved'
    ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) canonical_any ON TRUE

  -- 5. Lightspeed backfill image (last resort — only when no canonical image exists)
  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.product_id = p.id
      AND pi.approval_status = 'approved'
      AND pi.source = 'lightspeed'
    ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) lightspeed_fallback ON TRUE
)
SELECT *
FROM resolved
WHERE is_active = TRUE
  AND (listing_status IS NULL OR listing_status = 'active')
  AND (
    listing_type IN ('private_listing', 'store_inventory')
    OR COALESCE(qoh, 0) > 0
  )
  AND resolved_image_id IS NOT NULL
  -- Lightspeed products require a serper-workbench-approved image to be
  -- marketplace-visible. We check for existence of ANY approved serper image
  -- (on the product or its canonical product), not just the resolved/primary one,
  -- so that products with both a serper image and a higher-priority primary image
  -- are correctly shown.
  AND (
    COALESCE(listing_source, 'lightspeed') != 'lightspeed'
    OR EXISTS (
      SELECT 1
      FROM product_images si
      WHERE si.source = 'serper_workbench'
        AND si.approval_status = 'approved'
        AND (si.cloudinary_public_id IS NOT NULL OR si.cloudinary_url IS NOT NULL OR si.external_url IS NOT NULL)
        AND (
          si.product_id = resolved.id
          OR (resolved.canonical_product_id IS NOT NULL AND si.canonical_product_id = resolved.canonical_product_id)
        )
    )
  );

COMMENT ON VIEW marketplace_ready_products IS
  'Marketplace-eligible products with resolved image. '
  'Priority order: selected > curated-product-scoped > canonical_primary > canonical_any > lightspeed_fallback. '
  'Lightspeed backfill images (source=''lightspeed'') are demoted below canonical so curated serper images always win. '
  'Lightspeed products (listing_source=''lightspeed'' or NULL) require at least one approved serper_workbench image to be visible.';

GRANT SELECT ON marketplace_ready_products TO anon;
GRANT SELECT ON marketplace_ready_products TO authenticated;
