-- ============================================================
-- Drop redundant product_images variant URL columns
-- ============================================================
-- card_url, mobile_card_url, thumbnail_url, gallery_url, detail_url are 100%
-- derivable from cloudinary_public_id (computed at render time). All readers
-- and writers have been converged to public_id; this removes the dead columns.
--
-- Order matters: rewrite every DB object that references the columns FIRST
-- (trigger fn, sync fns, views), THEN drop the columns. Done in one transaction.
-- ============================================================

-- 1) Trigger function on product_images: stop reading card_url/thumbnail_url.
--    cached_image_url/cached_thumbnail_url (products columns) now derive from
--    the original cloudinary_url (or external_url) — legacy fallback fields.
CREATE OR REPLACE FUNCTION refresh_product_cached_image()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
  v_canonical_product_id UUID;
  v_image_url TEXT;
  v_listing_type TEXT;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  v_canonical_product_id := COALESCE(NEW.canonical_product_id, OLD.canonical_product_id);

  IF v_product_id IS NOT NULL THEN
    SELECT listing_type INTO v_listing_type FROM products WHERE id = v_product_id;
    IF v_listing_type = 'private_listing' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(pi.cloudinary_url, pi.external_url)
    INTO v_image_url
    FROM product_images pi
    WHERE pi.product_id = v_product_id
      AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
    ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
    LIMIT 1;

    UPDATE products
    SET cached_image_url = v_image_url,
        cached_thumbnail_url = v_image_url,
        has_displayable_image = (v_image_url IS NOT NULL)
    WHERE id = v_product_id;
  END IF;

  IF v_canonical_product_id IS NOT NULL THEN
    SELECT COALESCE(pi.cloudinary_url, pi.external_url)
    INTO v_image_url
    FROM product_images pi
    WHERE pi.canonical_product_id = v_canonical_product_id
      AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
    ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
    LIMIT 1;

    UPDATE products
    SET cached_image_url = v_image_url,
        cached_thumbnail_url = v_image_url,
        has_displayable_image = (v_image_url IS NOT NULL)
    WHERE canonical_product_id = v_canonical_product_id
      AND use_custom_image = FALSE
      AND (listing_type IS NULL OR listing_type != 'private_listing');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2) Legacy JSONB sync fns (still called by ecommerce-hero/manage): build the
--    products.images JSONB from cloudinary_url instead of the dropped columns.
CREATE OR REPLACE FUNCTION sync_product_images_to_jsonb(target_product_id UUID)
RETURNS VOID AS $$
DECLARE
  image_data JSONB;
  v_primary_url TEXT;
BEGIN
  WITH ordered_images AS (
    SELECT pi.*,
      (ROW_NUMBER() OVER (ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC) - 1)::int AS computed_order
    FROM product_images pi
    WHERE pi.product_id = target_product_id
      AND pi.approval_status = 'approved'
      AND (pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id::text,
      'url', COALESCE(oi.cloudinary_url, oi.external_url),
      'cardUrl', COALESCE(oi.cloudinary_url, oi.external_url),
      'cloudinaryPublicId', oi.cloudinary_public_id,
      'isPrimary', oi.is_primary,
      'order', oi.computed_order,
      'source', 'product_images'
    ) ORDER BY oi.computed_order
  ), '[]'::jsonb)
  INTO image_data FROM ordered_images oi;

  v_primary_url := COALESCE(image_data->0->>'cardUrl', image_data->0->>'url');

  UPDATE products SET images = image_data, primary_image_url = v_primary_url
  WHERE id = target_product_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_canonical_images_to_products(target_canonical_id UUID)
RETURNS VOID AS $$
DECLARE
  image_data JSONB;
  v_primary_url TEXT;
BEGIN
  WITH ordered_images AS (
    SELECT pi.*,
      (ROW_NUMBER() OVER (ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC) - 1)::int AS computed_order
    FROM product_images pi
    WHERE pi.canonical_product_id = target_canonical_id
      AND pi.approval_status = 'approved'
      AND (pi.cloudinary_url IS NOT NULL OR pi.external_url IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id::text,
      'url', COALESCE(oi.cloudinary_url, oi.external_url),
      'cardUrl', COALESCE(oi.cloudinary_url, oi.external_url),
      'cloudinaryPublicId', oi.cloudinary_public_id,
      'isPrimary', oi.is_primary,
      'order', oi.computed_order,
      'source', 'canonical'
    ) ORDER BY oi.computed_order
  ), '[]'::jsonb)
  INTO image_data FROM ordered_images oi;

  v_primary_url := COALESCE(image_data->0->>'cardUrl', image_data->0->>'url');

  UPDATE products SET images = image_data, primary_image_url = v_primary_url
  WHERE canonical_product_id = target_canonical_id
    AND (images IS NULL OR images = '[]'::jsonb OR jsonb_array_length(images) = 0);
END;
$$ LANGUAGE plpgsql;

-- 3) Unused view that referenced the columns.
DROP VIEW IF EXISTS products_with_primary_image;

-- 4) Admin workbench view: expose public_id/url/external instead of card/thumbnail.
DROP VIEW IF EXISTS image_workbench_products;
CREATE VIEW image_workbench_products
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
  primary_image.cloudinary_url              AS primary_cloudinary_url,
  primary_image.cloudinary_public_id        AS primary_cloudinary_public_id,
  primary_image.external_url                AS primary_external_url,
  COALESCE(product_counts.linked_products, 0)  AS linked_products,
  COALESCE(product_counts.ready_products, 0)   AS ready_products,
  COALESCE(product_counts.total_qoh, 0)        AS total_qoh,
  product_counts.min_price                      AS min_price,
  product_counts.max_price                      AS max_price,
  product_counts.avg_price                      AS avg_price,
  product_counts.store_product_name             AS store_product_name,
  product_counts.ls_category_name               AS ls_category_name,
  product_counts.ls_category_id                 AS ls_category_id
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
  -- Explicit columns (not pi.*) so the view doesn't depend on the dropped columns.
  SELECT pi.id, pi.cloudinary_public_id, pi.cloudinary_url, pi.external_url
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
    MIN(p.description) FILTER (WHERE p.description IS NOT NULL AND p.description <> '') AS store_product_name,
    MIN(p.category_name) FILTER (WHERE p.category_name IS NOT NULL AND p.category_name <> '') AS ls_category_name,
    MIN(p.lightspeed_category_id) FILTER (WHERE p.lightspeed_category_id IS NOT NULL AND p.lightspeed_category_id <> '') AS ls_category_id
  FROM products p
  WHERE p.canonical_product_id = cp.id
) product_counts ON TRUE;

GRANT SELECT ON image_workbench_products TO authenticated;

-- 5) marketplace_ready_products: replace LATERAL pi.* with explicit columns so
--    the view no longer pins a hard Postgres dependency on the dropped columns.
--    Structure is identical to migration 220000 except the three LATERAL subqueries
--    now name columns explicitly instead of using SELECT pi.*.
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
    COALESCE(selected_image.external_url, product_image.external_url, canonical_primary.external_url, canonical_any.external_url) AS resolved_external_url
  FROM products p
  LEFT JOIN product_images selected_image
    ON selected_image.id = p.selected_product_image_id
    AND selected_image.approval_status = 'approved'
    AND (
      selected_image.product_id = p.id
      OR selected_image.canonical_product_id = p.canonical_product_id
    )
  LEFT JOIN LATERAL (
    SELECT pi.id, pi.cloudinary_public_id, pi.cloudinary_url, pi.external_url
    FROM product_images pi
    WHERE pi.product_id = p.id
      AND pi.approval_status = 'approved'
    ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) product_image ON TRUE
  LEFT JOIN LATERAL (
    SELECT pi.id, pi.cloudinary_public_id, pi.cloudinary_url, pi.external_url
    FROM product_images pi
    WHERE pi.canonical_product_id = p.canonical_product_id
      AND p.canonical_product_id IS NOT NULL
      AND pi.approval_status = 'approved'
      AND pi.is_primary = TRUE
    ORDER BY pi.sort_order ASC NULLS LAST, pi.created_at ASC
    LIMIT 1
  ) canonical_primary ON TRUE
  LEFT JOIN LATERAL (
    SELECT pi.id, pi.cloudinary_public_id, pi.cloudinary_url, pi.external_url
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

COMMENT ON VIEW marketplace_ready_products IS 'Marketplace-eligible products. Image identity resolved to cloudinary_public_id (single source of truth); variant URLs are computed at render time. resolved_external_url is the only non-Cloudinary fallback.';

GRANT SELECT ON marketplace_ready_products TO anon;
GRANT SELECT ON marketplace_ready_products TO authenticated;

-- 6) Finally, drop the redundant columns.
ALTER TABLE product_images
  DROP COLUMN IF EXISTS card_url,
  DROP COLUMN IF EXISTS mobile_card_url,
  DROP COLUMN IF EXISTS thumbnail_url,
  DROP COLUMN IF EXISTS gallery_url,
  DROP COLUMN IF EXISTS detail_url;
