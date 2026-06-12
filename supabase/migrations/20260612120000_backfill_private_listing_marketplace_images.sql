-- Backfill selected_product_image_id for active private listings that have
-- approved product_images but were created before listing finalisation set
-- selected_product_image_id (required by marketplace_ready_products).

UPDATE products p
SET
  selected_product_image_id = picked.image_id,
  has_displayable_image = TRUE,
  display_name = COALESCE(NULLIF(TRIM(p.display_name), ''), NULLIF(TRIM(p.description), ''))
FROM (
  SELECT DISTINCT ON (pi.product_id)
    pi.product_id,
    pi.id AS image_id
  FROM product_images pi
  INNER JOIN products prod ON prod.id = pi.product_id
  WHERE pi.approval_status = 'approved'
    AND pi.product_id IS NOT NULL
    AND prod.listing_type = 'private_listing'
    AND prod.is_active = TRUE
    AND (prod.listing_status IS NULL OR prod.listing_status = 'active')
    AND prod.selected_product_image_id IS NULL
    AND (
      pi.cloudinary_public_id IS NOT NULL
      OR pi.cloudinary_url IS NOT NULL
      OR pi.external_url IS NOT NULL
    )
  ORDER BY
    pi.product_id,
    pi.is_primary DESC NULLS LAST,
    pi.sort_order ASC NULLS LAST,
    pi.created_at ASC
) picked
WHERE p.id = picked.product_id;

DO $$
BEGIN
  IF to_regclass('public.public_marketplace_cards') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public_marketplace_cards;
  END IF;
END $$;
