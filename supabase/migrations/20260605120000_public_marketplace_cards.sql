-- ============================================================
-- Public marketplace card feed
-- ============================================================
-- The homepage should not assemble listing cards from live joins on every
-- request. This materialized view denormalizes the public card fields used by
-- /marketplace, Bike Stores, and Uber. It is intentionally refreshed on a short
-- public-cache window rather than being transactionally live.

DROP MATERIALIZED VIEW IF EXISTS public_marketplace_space_counts;
DROP MATERIALIZED VIEW IF EXISTS public_marketplace_cards;

CREATE MATERIALIZED VIEW public_marketplace_cards AS
SELECT
  mrp.id,
  mrp.canonical_product_id,
  mrp.resolved_image_id,
  mrp.resolved_image_source,
  mrp.resolved_external_url,
  mrp.resolved_cloudinary_url,
  mrp.resolved_cloudinary_public_id,
  mrp.display_name,
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
WHERE mrp.resolved_image_id IS NOT NULL;

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

CREATE OR REPLACE FUNCTION refresh_public_marketplace_cards()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public_marketplace_cards;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public_marketplace_space_counts;
END;
$$;

GRANT SELECT ON public_marketplace_cards TO anon, authenticated;
GRANT SELECT ON public_marketplace_space_counts TO anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_public_marketplace_cards() TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'refresh-public-marketplace-cards'
  ) THEN
    PERFORM cron.unschedule('refresh-public-marketplace-cards');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-public-marketplace-cards',
  '* * * * *',
  $$SELECT public.refresh_public_marketplace_cards();$$
);

COMMENT ON MATERIALIZED VIEW public_marketplace_cards IS
  'Denormalized public listing cards for the marketplace homepage. Refresh every 30-60 seconds in production.';

COMMENT ON FUNCTION refresh_public_marketplace_cards() IS
  'Refreshes the denormalized public card feed and top-level space counts.';
