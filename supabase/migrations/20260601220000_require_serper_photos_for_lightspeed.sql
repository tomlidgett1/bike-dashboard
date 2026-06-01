-- ============================================================
-- Require serper-approved photos for Lightspeed products
-- ============================================================
-- Old images imported via the lightspeed backfill (source='lightspeed')
-- or any other non-serper source must no longer qualify a Lightspeed
-- store-inventory product for marketplace visibility. Only images that
-- went through the Serper image workbench (source='serper_workbench')
-- count for products where listing_source = 'lightspeed' (or NULL,
-- which the backfill treated as lightspeed).
--
-- Non-lightspeed products (manual, scheduled, facebook, online_catalog)
-- are unaffected — their uploaded/imported images still qualify.
-- ============================================================

DROP VIEW IF EXISTS marketplace_ready_products;

CREATE VIEW marketplace_ready_products
WITH (security_invoker = true)
AS
WITH resolved AS (
  SELECT
    p.*,
    COALESCE(selected_image.id, product_image.id, canonical_primary.id, canonical_any.id) AS resolved_image_id,
    CASE
      WHEN selected_image.id IS NOT NULL THEN 'selected'
      WHEN product_image.id IS NOT NULL THEN 'product'
      WHEN canonical_primary.id IS NOT NULL THEN 'canonical_primary'
      WHEN canonical_any.id IS NOT NULL THEN 'canonical_any'
      ELSE 'none'
    END AS resolved_image_source,
    COALESCE(selected_image.cloudinary_public_id, product_image.cloudinary_public_id, canonical_primary.cloudinary_public_id, canonical_any.cloudinary_public_id) AS resolved_cloudinary_public_id,
    COALESCE(selected_image.cloudinary_url, product_image.cloudinary_url, canonical_primary.cloudinary_url, canonical_any.cloudinary_url) AS resolved_cloudinary_url,
    COALESCE(selected_image.external_url, product_image.external_url, canonical_primary.external_url, canonical_any.external_url) AS resolved_external_url,
    COALESCE(selected_image.source, product_image.source, canonical_primary.source, canonical_any.source) AS resolved_image_provider
  FROM products p
  LEFT JOIN product_images selected_image
    ON selected_image.id = p.selected_product_image_id
    AND selected_image.approval_status = 'approved'
    AND (
      selected_image.product_id = p.id
      OR selected_image.canonical_product_id = p.canonical_product_id
    )
  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.product_id = p.id
      AND pi.approval_status = 'approved'
    ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) product_image ON TRUE
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
  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.canonical_product_id = p.canonical_product_id
      AND p.canonical_product_id IS NOT NULL
      AND pi.approval_status = 'approved'
    ORDER BY pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) canonical_any ON TRUE
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
  -- Lightspeed products require a serper-workbench-approved image.
  -- Other listing sources (manual, scheduled, facebook, online_catalog)
  -- may use any approved image.
  AND (
    COALESCE(listing_source, 'lightspeed') != 'lightspeed'
    OR resolved_image_provider = 'serper_workbench'
  );

COMMENT ON VIEW marketplace_ready_products IS 'Marketplace-eligible products. Lightspeed products (listing_source = ''lightspeed'' or NULL) are only shown once a serper_workbench image has been approved. Image identity resolved to cloudinary_public_id (single source of truth); variant URLs are computed at render time. resolved_external_url is the only non-Cloudinary fallback.';

GRANT SELECT ON marketplace_ready_products TO anon;
GRANT SELECT ON marketplace_ready_products TO authenticated;
