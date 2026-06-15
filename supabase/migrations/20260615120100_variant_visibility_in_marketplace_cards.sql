-- ============================================================
-- Variant visibility in the marketplace feed
-- ============================================================
-- When a variant group is shown as "one listing" (master_only), the
-- non-master child products are flagged products.variant_hidden_from_grid,
-- and the master child carries products.variant_master_title (base title).
--
-- A Postgres view freezes its column list (p.* / SELECT *) at creation time,
-- so the existing marketplace_ready_products view does NOT expose the new
-- variant_* product columns. We must drop and recreate it (verbatim, from
-- 20260609141000) so p.* re-expands to include them, then redefine
-- public_marketplace_cards to:
--   1. hide variant children that should not appear as separate listings, and
--   2. show the master title for the master child.
--
-- The SQL function get_bike_stores_for_marketplace_filters() references the
-- base view by name with a string body, so it records no hard dependency and
-- keeps working after the view is recreated.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public_marketplace_space_counts;
DROP MATERIALIZED VIEW IF EXISTS public_marketplace_cards;
DROP VIEW IF EXISTS marketplace_ready_products;

-- Recreate the base view verbatim (from 20260609141000) so it picks up the
-- new products.variant_* columns via p.*.
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

-- Denormalized public card feed, now variant-aware.
CREATE MATERIALIZED VIEW public_marketplace_cards AS
SELECT
  mrp.id,
  mrp.canonical_product_id,
  mrp.resolved_image_id,
  mrp.resolved_image_source,
  mrp.resolved_external_url,
  mrp.resolved_cloudinary_url,
  mrp.resolved_cloudinary_public_id,
  -- Variant master child shows the master (base) title; everything else its own name.
  COALESCE(mrp.variant_master_title, mrp.display_name) AS display_name,
  mrp.description,
  mrp.price,
  mrp.discount_percent,
  mrp.discount_active,
  mrp.discount_ends_at,
  mrp.sale_price,
  mrp.marketplace_category,
  mrp.marketplace_subcategory,
  mrp.marketplace_level_3_category,
  mrp.category_name,
  mrp.qoh,
  mrp.created_at,
  mrp.user_id,
  COALESCE(mrp.brand, mrp.manufacturer_name) AS brand,
  CASE
    WHEN mrp.listing_type = 'private_listing' THEN 'private_listing'
    WHEN mrp.listing_type = 'store_inventory' THEN 'store_inventory'
    WHEN u.account_type = 'bicycle_store' AND u.bicycle_store = TRUE THEN 'store_inventory'
    ELSE mrp.listing_type
  END AS listing_type,
  mrp.listing_source,
  mrp.listing_status,
  mrp.uber_delivery_enabled,
  mrp.model_year,
  mrp.condition_rating,
  mrp.pickup_location,
  NULLIF(BTRIM(u.business_name), '') AS store_name,
  u.logo_url AS store_logo_url,
  u.account_type AS store_account_type,
  COALESCE(u.bicycle_store, FALSE) AS store_bicycle_store,
  u.first_name,
  u.last_name,
  (u.account_type = 'bicycle_store' AND u.bicycle_store = TRUE) AS is_verified_bike_store
FROM marketplace_ready_products mrp
LEFT JOIN users u ON u.user_id = mrp.user_id
WHERE mrp.resolved_image_id IS NOT NULL
  -- Hide child variants that should appear only inside the master listing.
  AND COALESCE(mrp.variant_hidden_from_grid, FALSE) = FALSE;

CREATE UNIQUE INDEX public_marketplace_cards_id_idx
  ON public_marketplace_cards (id);

CREATE INDEX public_marketplace_cards_newest_idx
  ON public_marketplace_cards (created_at DESC, id DESC);

CREATE INDEX public_marketplace_cards_listing_newest_idx
  ON public_marketplace_cards (listing_type, created_at DESC, id DESC);

CREATE INDEX public_marketplace_cards_store_newest_idx
  ON public_marketplace_cards (is_verified_bike_store, created_at DESC, id DESC)
  WHERE is_verified_bike_store = TRUE;

CREATE INDEX public_marketplace_cards_uber_newest_idx
  ON public_marketplace_cards (uber_delivery_enabled, is_verified_bike_store, created_at DESC, id DESC)
  WHERE uber_delivery_enabled = TRUE AND is_verified_bike_store = TRUE;

CREATE INDEX public_marketplace_cards_marketplace_category_idx
  ON public_marketplace_cards (marketplace_category, created_at DESC, id DESC);

CREATE INDEX public_marketplace_cards_store_category_idx
  ON public_marketplace_cards (category_name, created_at DESC, id DESC);

CREATE INDEX public_marketplace_cards_user_newest_idx
  ON public_marketplace_cards (user_id, created_at DESC, id DESC);

CREATE INDEX public_marketplace_cards_price_idx
  ON public_marketplace_cards (price);

CREATE INDEX public_marketplace_cards_brand_idx
  ON public_marketplace_cards (brand);

CREATE MATERIALIZED VIEW public_marketplace_space_counts AS
SELECT 'marketplace'::TEXT AS space, COUNT(*)::BIGINT AS total
FROM public_marketplace_cards
WHERE listing_type = 'private_listing'
  AND (listing_status IS NULL OR listing_status = 'active')
UNION ALL
SELECT 'stores'::TEXT AS space, COUNT(*)::BIGINT AS total
FROM public_marketplace_cards
WHERE listing_type = 'store_inventory'
  AND is_verified_bike_store = TRUE
  AND (listing_status IS NULL OR listing_status = 'active')
UNION ALL
SELECT 'uber'::TEXT AS space, COUNT(*)::BIGINT AS total
FROM public_marketplace_cards
WHERE uber_delivery_enabled = TRUE
  AND is_verified_bike_store = TRUE
  AND (listing_status IS NULL OR listing_status = 'active');

CREATE UNIQUE INDEX public_marketplace_space_counts_space_idx
  ON public_marketplace_space_counts (space);

GRANT SELECT ON public_marketplace_cards TO anon, authenticated;
GRANT SELECT ON public_marketplace_space_counts TO anon, authenticated;

COMMENT ON MATERIALIZED VIEW public_marketplace_cards IS
  'Denormalized public listing cards for the marketplace homepage. '
  'Variant children flagged variant_hidden_from_grid are excluded; the master child shows variant_master_title.';
