-- Prefer durable Cloudinary-backed images for public marketplace display.
--
-- Raw retailer/CDN URLs can disappear after approval. They remain a last-resort
-- fallback, but cards and product feeds should use Cloudinary whenever an
-- approved Cloudinary-backed image exists for the product/canonical product.

CREATE OR REPLACE VIEW marketplace_ready_products
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

  LEFT JOIN product_images selected_image
    ON selected_image.id = p.selected_product_image_id
    AND selected_image.approval_status = 'approved'
    AND (
      selected_image.product_id = p.id
      OR selected_image.canonical_product_id = p.canonical_product_id
    )
    AND (
      selected_image.cloudinary_public_id IS NOT NULL
      OR selected_image.cloudinary_url IS NOT NULL
    )

  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.product_id = p.id
      AND pi.approval_status = 'approved'
      AND (pi.source IS NULL OR pi.source != 'lightspeed')
    ORDER BY
      (pi.cloudinary_public_id IS NOT NULL OR pi.cloudinary_url IS NOT NULL) DESC,
      pi.is_primary DESC NULLS LAST,
      pi.sort_order ASC NULLS LAST,
      pi.created_at ASC
    LIMIT 1
  ) product_image_curated ON TRUE

  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.canonical_product_id = p.canonical_product_id
      AND p.canonical_product_id IS NOT NULL
      AND pi.approval_status = 'approved'
      AND pi.is_primary = TRUE
      AND (
        pi.cloudinary_public_id IS NOT NULL
        OR pi.cloudinary_url IS NOT NULL
      )
    ORDER BY pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) canonical_primary ON TRUE

  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.canonical_product_id = p.canonical_product_id
      AND p.canonical_product_id IS NOT NULL
      AND pi.approval_status = 'approved'
    ORDER BY
      (pi.cloudinary_public_id IS NOT NULL OR pi.cloudinary_url IS NOT NULL) DESC,
      pi.is_primary DESC NULLS LAST,
      pi.sort_order ASC NULLS LAST,
      pi.created_at ASC
    LIMIT 1
  ) canonical_any ON TRUE

  LEFT JOIN LATERAL (
    SELECT pi.*
    FROM product_images pi
    WHERE pi.product_id = p.id
      AND pi.approval_status = 'approved'
      AND pi.source = 'lightspeed'
    ORDER BY
      (pi.cloudinary_public_id IS NOT NULL OR pi.cloudinary_url IS NOT NULL) DESC,
      pi.is_primary DESC NULLS LAST,
      pi.sort_order ASC NULLS LAST,
      pi.created_at ASC
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
  AND (
    COALESCE(listing_source, 'lightspeed') != 'lightspeed'
    OR EXISTS (
      SELECT 1
      FROM product_images si
      WHERE si.source = 'serper_workbench'
        AND si.approval_status = 'approved'
        AND (si.cloudinary_public_id IS NOT NULL OR si.cloudinary_url IS NOT NULL)
        AND (
          si.product_id = resolved.id
          OR (resolved.canonical_product_id IS NOT NULL AND si.canonical_product_id = resolved.canonical_product_id)
        )
    )
  );

COMMENT ON VIEW marketplace_ready_products IS
  'Marketplace-eligible products with resolved image. '
  'Priority order: selected Cloudinary image > curated product image > canonical primary > canonical any > lightspeed fallback. '
  'Cloudinary-backed approved images are preferred over raw external URLs to avoid broken public cards. '
  'Lightspeed products require at least one approved Cloudinary-backed serper_workbench image to be visible.';

GRANT SELECT ON marketplace_ready_products TO anon;
GRANT SELECT ON marketplace_ready_products TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.public_marketplace_cards') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public_marketplace_cards;
  END IF;
END $$;
