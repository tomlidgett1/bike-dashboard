-- ============================================================
-- Image Readiness + Workbench State
-- ============================================================
-- Establishes product_images as the image asset source of truth while
-- preserving legacy columns during the transition.

-- Store-specific image workflow state. No URLs are duplicated here.
ALTER TABLE products
ADD COLUMN IF NOT EXISTS selected_product_image_id UUID REFERENCES product_images(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS image_review_status TEXT DEFAULT 'pending'
  CHECK (image_review_status IN ('pending', 'recommended', 'in_review', 'ready', 'no_results', 'failed')),
ADD COLUMN IF NOT EXISTS image_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS image_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS image_review_source TEXT,
ADD COLUMN IF NOT EXISTS image_review_error TEXT;

CREATE INDEX IF NOT EXISTS idx_products_selected_product_image_id
  ON products(selected_product_image_id)
  WHERE selected_product_image_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_image_review_status
  ON products(image_review_status);

-- Canonical products drive the daily image workbench.
ALTER TABLE canonical_products
ADD COLUMN IF NOT EXISTS image_review_status TEXT DEFAULT 'pending'
  CHECK (image_review_status IN ('pending', 'recommended', 'in_review', 'ready', 'no_results', 'failed')),
ADD COLUMN IF NOT EXISTS image_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS image_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS image_review_source TEXT,
ADD COLUMN IF NOT EXISTS image_review_search_query TEXT,
ADD COLUMN IF NOT EXISTS image_review_error TEXT;

CREATE INDEX IF NOT EXISTS idx_canonical_products_image_review_status
  ON canonical_products(image_review_status);

-- One resolved readiness surface for public marketplace queries.
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
  AND (listing_type = 'private_listing' OR COALESCE(qoh, 0) > 0)
  AND resolved_image_id IS NOT NULL;

GRANT SELECT ON marketplace_ready_products TO anon;
GRANT SELECT ON marketplace_ready_products TO authenticated;

-- Workbench read model for category/day batching.
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
  COALESCE(image_counts.total_count, 0) AS total_images,
  COALESCE(image_counts.pending_count, 0) AS pending_images,
  COALESCE(image_counts.approved_count, 0) AS approved_images,
  COALESCE(image_counts.rejected_count, 0) AS rejected_images,
  primary_image.id AS primary_image_id,
  primary_image.card_url AS primary_card_url,
  primary_image.thumbnail_url AS primary_thumbnail_url,
  primary_image.cloudinary_url AS primary_cloudinary_url,
  primary_image.cloudinary_public_id AS primary_cloudinary_public_id,
  COALESCE(product_counts.linked_products, 0) AS linked_products,
  COALESCE(product_counts.ready_products, 0) AS ready_products
FROM canonical_products cp
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE approval_status = 'pending') AS pending_count,
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
    COUNT(*) AS linked_products,
    COUNT(*) FILTER (WHERE p.image_review_status = 'ready') AS ready_products
  FROM products p
  WHERE p.canonical_product_id = cp.id
) product_counts ON TRUE;

GRANT SELECT ON image_workbench_products TO authenticated;

COMMENT ON VIEW marketplace_ready_products IS 'Products eligible for public marketplace display with image readiness resolved from product_images.';
COMMENT ON VIEW image_workbench_products IS 'Canonical products with image review counts and primary image state for the Image Workbench.';

-- Backfill review state from existing approved images without changing legacy columns.
UPDATE canonical_products cp
SET
  image_review_status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM product_images pi
      WHERE pi.canonical_product_id = cp.id
        AND pi.approval_status = 'approved'
        AND pi.is_primary = TRUE
    ) THEN 'ready'
    WHEN EXISTS (
      SELECT 1
      FROM product_images pi
      WHERE pi.canonical_product_id = cp.id
        AND pi.approval_status = 'approved'
    ) THEN 'in_review'
    WHEN EXISTS (
      SELECT 1
      FROM product_images pi
      WHERE pi.canonical_product_id = cp.id
        AND pi.approval_status = 'pending'
    ) THEN 'in_review'
    ELSE COALESCE(cp.image_review_status, 'pending')
  END,
  image_reviewed_at = CASE
    WHEN EXISTS (
      SELECT 1
      FROM product_images pi
      WHERE pi.canonical_product_id = cp.id
        AND pi.approval_status = 'approved'
        AND pi.is_primary = TRUE
    ) THEN COALESCE(cp.image_reviewed_at, NOW())
    ELSE cp.image_reviewed_at
  END
WHERE cp.image_review_status IS NULL
   OR cp.image_review_status = 'pending';

UPDATE products p
SET
  image_review_status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM product_images pi
      WHERE (
          pi.product_id = p.id
          OR pi.canonical_product_id = p.canonical_product_id
        )
        AND pi.approval_status = 'approved'
    ) THEN 'ready'
    ELSE COALESCE(p.image_review_status, 'pending')
  END,
  image_reviewed_at = CASE
    WHEN EXISTS (
      SELECT 1
      FROM product_images pi
      WHERE (
          pi.product_id = p.id
          OR pi.canonical_product_id = p.canonical_product_id
        )
        AND pi.approval_status = 'approved'
    ) THEN COALESCE(p.image_reviewed_at, NOW())
    ELSE p.image_reviewed_at
  END
WHERE p.image_review_status IS NULL
   OR p.image_review_status = 'pending';

COMMENT ON COLUMN products.images IS 'DEPRECATED: legacy JSONB image cache. product_images is the image source of truth.';
COMMENT ON COLUMN products.primary_image_url IS 'DEPRECATED: legacy image cache. Resolve primary images via product_images / marketplace_ready_products.';
COMMENT ON COLUMN products.cached_image_url IS 'DEPRECATED: legacy image cache. Resolve card images via product_images / marketplace_ready_products.';
COMMENT ON COLUMN products.cached_thumbnail_url IS 'DEPRECATED: legacy image cache. Resolve thumbnails via product_images / marketplace_ready_products.';
COMMENT ON COLUMN products.has_displayable_image IS 'DEPRECATED: legacy image readiness flag. Use marketplace_ready_products.';
COMMENT ON COLUMN products.images_approved_by_admin IS 'DEPRECATED: legacy product-level gate. Use image_review_status and approved product_images.';
