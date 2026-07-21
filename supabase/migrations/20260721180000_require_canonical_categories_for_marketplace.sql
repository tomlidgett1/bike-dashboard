-- Require canonical Yellow Jersey L1/L2 on marketplace-ready products.
-- Preserves the existing resolved-image CTE; only tightens the WHERE clause.
-- Dependent materialized views are rebuilt afterwards.

DROP MATERIALIZED VIEW IF EXISTS public_marketplace_space_counts;
DROP MATERIALIZED VIEW IF EXISTS public_marketplace_cards;
DROP VIEW IF EXISTS products_needing_marketplace_optimisation;

CREATE OR REPLACE VIEW marketplace_ready_products
WITH (security_invoker = true)
AS
WITH resolved AS (
         SELECT p.id,
            p.user_id,
            p.lightspeed_item_id,
            p.lightspeed_category_id,
            p.lightspeed_account_id,
            p.system_sku,
            p.custom_sku,
            p.description,
            p.category_name,
            p.full_category_path,
            p.price,
            p.default_cost,
            p.avg_cost,
            p.qoh,
            p.sellable,
            p.reorder_point,
            p.reorder_level,
            p.model_year,
            p.upc,
            p.manufacturer_id,
            p.manufacturer_name,
            p.images,
            p.primary_image_url,
            p.last_synced_at,
            p.lightspeed_updated_at,
            p.is_active,
            p.is_archived,
            p.created_at,
            p.updated_at,
            p.category_id,
            p.category_path,
            p.marketplace_category,
            p.marketplace_subcategory,
            p.canonical_product_id,
            p.use_custom_image,
            p.custom_image_url,
            p.listing_source,
            p.listing_type,
            p.listing_status,
            p.marketplace_level_3_category,
            p.display_name,
            p.search_text,
            p.facebook_source_url,
            p.cached_image_url,
            p.has_displayable_image,
            p.cached_thumbnail_url,
            p.sold_at,
            p.brand,
            p.model,
            p.smart_upload_metadata,
            p.web_search_sources,
            p.ai_confidence_scores,
            p.frame_size,
            p.frame_material,
            p.bike_type,
            p.groupset,
            p.wheel_size,
            p.suspension_type,
            p.bike_weight,
            p.color_primary,
            p.color_secondary,
            p.part_type_detail,
            p.compatibility_notes,
            p.material,
            p.weight,
            p.size,
            p.gender_fit,
            p.apparel_material,
            p.seller_notes,
            p.hero_background_optimized,
            p.images_approved_by_admin,
            p.images_approved_at,
            p.needs_secondary_review,
            p.secondary_review_flagged_at,
            p.product_description,
            p.shipping_available,
            p.shipping_cost,
            p.pickup_location,
            p.pickup_only,
            p.bike_surface,
            p.condition_rating,
            p.published_at,
            p.condition_details,
            p.wear_notes,
            p.usage_estimate,
            p.purchase_location,
            p.purchase_date,
            p.service_history,
            p.upgrades_modifications,
            p.reason_for_selling,
            p.is_negotiable,
            p.included_accessories,
            p.seller_contact_preference,
            p.seller_phone,
            p.seller_email,
            p.expires_at,
            p.selected_product_image_id,
            p.image_review_status,
            p.image_reviewed_at,
            p.image_reviewed_by,
            p.image_review_source,
            p.image_review_error,
            p.product_specs,
            p.discount_percent,
            p.discount_active,
            p.discount_ends_at,
            p.sale_price,
            p.immersive_page,
            p.uber_delivery_enabled,
            p.is_bicycle,
            p.bike_specs,
            p.product_spec_sources,
            p.catalog_search_text,
            p.catalog_search_vector,
            p.suggested_brand_name,
            p.suggested_brand_manufacturer_id,
            p.suggested_brand_source,
            p.suggested_brand_confidence,
            p.suggested_brand_fingerprint,
            p.suggested_brand_at,
            p.variant_group_id,
            p.variant_master_title,
            p.variant_hidden_from_grid,
            p.suggested_category_id,
            p.suggested_category_label,
            p.suggested_category_source,
            p.suggested_category_confidence,
            p.suggested_category_fingerprint,
            p.suggested_category_at,
            p.is_specials_discount,
            COALESCE(selected_image.id, product_image_curated.id, canonical_primary.id, canonical_any.id, lightspeed_fallback.id) AS resolved_image_id,
                CASE
                    WHEN selected_image.id IS NOT NULL THEN 'selected'::text
                    WHEN product_image_curated.id IS NOT NULL THEN 'product'::text
                    WHEN canonical_primary.id IS NOT NULL THEN 'canonical_primary'::text
                    WHEN canonical_any.id IS NOT NULL THEN 'canonical_any'::text
                    WHEN lightspeed_fallback.id IS NOT NULL THEN 'lightspeed_fallback'::text
                    ELSE 'none'::text
                END AS resolved_image_source,
            COALESCE(selected_image.cloudinary_public_id, product_image_curated.cloudinary_public_id, canonical_primary.cloudinary_public_id, canonical_any.cloudinary_public_id, lightspeed_fallback.cloudinary_public_id) AS resolved_cloudinary_public_id,
            COALESCE(selected_image.cloudinary_url, product_image_curated.cloudinary_url, canonical_primary.cloudinary_url, canonical_any.cloudinary_url, lightspeed_fallback.cloudinary_url) AS resolved_cloudinary_url,
            COALESCE(selected_image.external_url, product_image_curated.external_url, canonical_primary.external_url, canonical_any.external_url, lightspeed_fallback.external_url) AS resolved_external_url,
            COALESCE(selected_image.source, product_image_curated.source, canonical_primary.source, canonical_any.source, lightspeed_fallback.source) AS resolved_image_provider
           FROM products p
             LEFT JOIN product_images selected_image ON selected_image.id = p.selected_product_image_id AND selected_image.approval_status = 'approved'::text AND (selected_image.product_id = p.id OR selected_image.canonical_product_id = p.canonical_product_id) AND (selected_image.cloudinary_public_id IS NOT NULL OR selected_image.cloudinary_url IS NOT NULL)
             LEFT JOIN LATERAL ( SELECT pi.*
                   FROM product_images pi
                  WHERE pi.product_id = p.id AND pi.approval_status = 'approved'::text AND (pi.source IS NULL OR pi.source <> 'lightspeed'::text)
                  ORDER BY (pi.cloudinary_public_id IS NOT NULL OR pi.cloudinary_url IS NOT NULL) DESC, pi.is_primary DESC NULLS LAST, pi.sort_order, pi.created_at
                 LIMIT 1) product_image_curated ON true
             LEFT JOIN LATERAL ( SELECT pi.*
                   FROM product_images pi
                  WHERE pi.canonical_product_id = p.canonical_product_id AND p.canonical_product_id IS NOT NULL AND pi.approval_status = 'approved'::text AND pi.is_primary = true AND (pi.cloudinary_public_id IS NOT NULL OR pi.cloudinary_url IS NOT NULL)
                  ORDER BY pi.sort_order, pi.created_at
                 LIMIT 1) canonical_primary ON true
             LEFT JOIN LATERAL ( SELECT pi.*
                   FROM product_images pi
                  WHERE pi.canonical_product_id = p.canonical_product_id AND p.canonical_product_id IS NOT NULL AND pi.approval_status = 'approved'::text
                  ORDER BY (pi.cloudinary_public_id IS NOT NULL OR pi.cloudinary_url IS NOT NULL) DESC, pi.is_primary DESC NULLS LAST, pi.sort_order, pi.created_at
                 LIMIT 1) canonical_any ON true
             LEFT JOIN LATERAL ( SELECT pi.*
                   FROM product_images pi
                  WHERE pi.product_id = p.id AND pi.approval_status = 'approved'::text AND pi.source = 'lightspeed'::text
                  ORDER BY (pi.cloudinary_public_id IS NOT NULL OR pi.cloudinary_url IS NOT NULL) DESC, pi.is_primary DESC NULLS LAST, pi.sort_order, pi.created_at
                 LIMIT 1) lightspeed_fallback ON true
        )
 SELECT *
   FROM resolved
  WHERE is_active = true
    AND (listing_status IS NULL OR listing_status = 'active'::text)
    AND ((listing_type = ANY (ARRAY['private_listing'::text, 'store_inventory'::text])) OR COALESCE(qoh, 0) > 0)
    AND resolved_image_id IS NOT NULL
    AND COALESCE(variant_hidden_from_grid, false) = false
    AND NULLIF(BTRIM(marketplace_category), '') IS NOT NULL
    AND NULLIF(BTRIM(marketplace_subcategory), '') IS NOT NULL
    AND (COALESCE(listing_source, 'lightspeed'::text) <> 'lightspeed'::text OR (EXISTS ( SELECT 1
           FROM product_images si
          WHERE si.source = 'serper_workbench'::text AND si.approval_status = 'approved'::text AND (si.cloudinary_public_id IS NOT NULL OR si.cloudinary_url IS NOT NULL) AND (si.product_id = resolved.id OR resolved.canonical_product_id IS NOT NULL AND si.canonical_product_id = resolved.canonical_product_id))));

COMMENT ON VIEW marketplace_ready_products IS
  'Marketplace-eligible products with resolved image and canonical Yellow Jersey L1/L2.';

GRANT SELECT ON marketplace_ready_products TO anon;
GRANT SELECT ON marketplace_ready_products TO authenticated;

CREATE VIEW products_needing_marketplace_optimisation
WITH (security_invoker = true)
AS
SELECT p.*
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM marketplace_ready_products mrp
  WHERE mrp.id = p.id
);

GRANT SELECT ON products_needing_marketplace_optimisation TO authenticated;

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

CREATE UNIQUE INDEX public_marketplace_cards_id_idx ON public_marketplace_cards (id);
CREATE INDEX public_marketplace_cards_newest_idx ON public_marketplace_cards (created_at DESC, id DESC);
CREATE INDEX public_marketplace_cards_listing_newest_idx ON public_marketplace_cards (listing_type, created_at DESC, id DESC);
CREATE INDEX public_marketplace_cards_store_newest_idx ON public_marketplace_cards (is_verified_bike_store, created_at DESC, id DESC) WHERE is_verified_bike_store = TRUE;
CREATE INDEX public_marketplace_cards_uber_newest_idx ON public_marketplace_cards (uber_delivery_enabled, is_verified_bike_store, created_at DESC, id DESC) WHERE uber_delivery_enabled = TRUE AND is_verified_bike_store = TRUE;
CREATE INDEX public_marketplace_cards_marketplace_category_idx ON public_marketplace_cards (marketplace_category, created_at DESC, id DESC);
CREATE INDEX public_marketplace_cards_marketplace_l1_l2_idx ON public_marketplace_cards (marketplace_category, marketplace_subcategory, created_at DESC, id DESC);
CREATE INDEX public_marketplace_cards_store_category_idx ON public_marketplace_cards (category_name, created_at DESC, id DESC);
CREATE INDEX public_marketplace_cards_user_newest_idx ON public_marketplace_cards (user_id, created_at DESC, id DESC);
CREATE INDEX public_marketplace_cards_price_idx ON public_marketplace_cards (price);
CREATE INDEX public_marketplace_cards_brand_idx ON public_marketplace_cards (brand);

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

CREATE UNIQUE INDEX public_marketplace_space_counts_space_idx ON public_marketplace_space_counts (space);

GRANT SELECT ON public_marketplace_cards TO anon, authenticated;
GRANT SELECT ON public_marketplace_space_counts TO anon, authenticated;
