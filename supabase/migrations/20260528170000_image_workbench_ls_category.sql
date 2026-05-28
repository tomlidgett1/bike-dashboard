-- ============================================================
-- Expose Lightspeed category name in image_workbench_products
-- Picks a representative category_name from any store product
-- linked to each canonical product, so the rapid-review panel
-- can filter by the real imported Lightspeed category names
-- (e.g. "Road Bikes") instead of the often-null canonical
-- category / marketplace_category fields.
-- ============================================================

CREATE OR REPLACE VIEW image_workbench_products
WITH (security_invoker = true)
AS
SELECT
  cp.id,
  cp.normalized_name,
  cp.display_name,
  cp.upc,
  cp.category,
  cp.manufacturer,
  cp.marketplace_category,
  cp.marketplace_subcategory,
  cp.marketplace_level_3_category,
  cp.created_at,
  cp.updated_at,
  cp.image_review_status,
  cp.image_reviewed_at,
  cp.image_reviewed_by,
  cp.image_review_source,
  cp.image_review_search_query,
  cp.image_review_error,
  COALESCE(image_counts.total_count, 0)    AS total_images,
  COALESCE(image_counts.pending_count, 0)  AS pending_images,
  COALESCE(image_counts.approved_count, 0) AS approved_images,
  COALESCE(image_counts.rejected_count, 0) AS rejected_images,
  primary_image.id                          AS primary_image_id,
  primary_image.card_url                    AS primary_card_url,
  primary_image.thumbnail_url               AS primary_thumbnail_url,
  primary_image.cloudinary_url              AS primary_cloudinary_url,
  primary_image.cloudinary_public_id        AS primary_cloudinary_public_id,
  COALESCE(product_counts.linked_products, 0)  AS linked_products,
  COALESCE(product_counts.ready_products, 0)   AS ready_products,
  COALESCE(product_counts.total_qoh, 0)        AS total_qoh,
  product_counts.min_price                      AS min_price,
  product_counts.max_price                      AS max_price,
  product_counts.avg_price                      AS avg_price,
  product_counts.store_product_name             AS store_product_name,
  -- Representative Lightspeed category name from any linked store product.
  -- Populated by the full Lightspeed sync (products.category_name), so it
  -- shows real names like "Road Bikes" / "Mountain Bikes" rather than IDs.
  product_counts.ls_category_name               AS ls_category_name
FROM canonical_products cp
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                              AS total_count,
    COUNT(*) FILTER (WHERE approval_status = 'pending')  AS pending_count,
    COUNT(*) FILTER (WHERE approval_status = 'approved') AS approved_count,
    COUNT(*) FILTER (WHERE approval_status = 'rejected') AS rejected_count
  FROM product_images pi
  WHERE pi.canonical_product_id = cp.id
) image_counts ON TRUE
LEFT JOIN LATERAL (
  SELECT pi.*
  FROM product_images pi
  WHERE pi.canonical_product_id = cp.id
    AND pi.approval_status = 'approved'
  ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC NULLS LAST, pi.created_at ASC
  LIMIT 1
) primary_image ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                  AS linked_products,
    COUNT(*) FILTER (WHERE p.image_review_status = 'ready')  AS ready_products,
    COALESCE(SUM(COALESCE(p.qoh, 0)), 0)                     AS total_qoh,
    MIN(p.price)                                             AS min_price,
    MAX(p.price)                                             AS max_price,
    AVG(p.price)                                             AS avg_price,
    -- Pick the shortest non-null description as the most readable store name
    MIN(p.description) FILTER (WHERE p.description IS NOT NULL AND p.description <> '') AS store_product_name,
    -- First non-null Lightspeed category name from any linked store product
    MIN(p.category_name) FILTER (WHERE p.category_name IS NOT NULL AND p.category_name <> '') AS ls_category_name
  FROM products p
  WHERE p.canonical_product_id = cp.id
) product_counts ON TRUE;

GRANT SELECT ON image_workbench_products TO authenticated;

COMMENT ON VIEW image_workbench_products IS
  'Canonical products with image review counts, primary image state, aggregate SOH/price, representative store product name, and Lightspeed category name from linked store products.';
