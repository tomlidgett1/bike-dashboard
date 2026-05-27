-- Bike shop catalogue rows often have listing_type = store_inventory with qoh NULL/0
-- until POS sync. They were excluded by the readiness view (only private_listing bypassed
-- the qoh check), so the Bike Stores tab returned zero rows. Include store_inventory when
-- the row is otherwise marketplace-ready (active, image resolved).

CREATE OR REPLACE VIEW marketplace_ready_products
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
    COALESCE(selected_image.card_url, product_image.card_url, canonical_primary.card_url, canonical_any.card_url) AS resolved_card_url,
    COALESCE(selected_image.thumbnail_url, product_image.thumbnail_url, canonical_primary.thumbnail_url, canonical_any.thumbnail_url) AS resolved_thumbnail_url,
    COALESCE(selected_image.mobile_card_url, product_image.mobile_card_url, canonical_primary.mobile_card_url, canonical_any.mobile_card_url) AS resolved_mobile_card_url,
    COALESCE(selected_image.gallery_url, product_image.gallery_url, canonical_primary.gallery_url, canonical_any.gallery_url) AS resolved_gallery_url,
    COALESCE(selected_image.detail_url, product_image.detail_url, canonical_primary.detail_url, canonical_any.detail_url) AS resolved_detail_url,
    COALESCE(selected_image.cloudinary_url, product_image.cloudinary_url, canonical_primary.cloudinary_url, canonical_any.cloudinary_url) AS resolved_cloudinary_url,
    COALESCE(selected_image.cloudinary_public_id, product_image.cloudinary_public_id, canonical_primary.cloudinary_public_id, canonical_any.cloudinary_public_id) AS resolved_cloudinary_public_id
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
  AND resolved_image_id IS NOT NULL;

COMMENT ON VIEW marketplace_ready_products IS 'Products eligible for public marketplace display with image readiness resolved from product_images. Store inventory is included when active with a resolved image (qoh may be null during catalogue sync).';
