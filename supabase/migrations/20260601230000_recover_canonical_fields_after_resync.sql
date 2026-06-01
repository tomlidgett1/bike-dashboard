-- ============================================================
-- Recover canonical fields lost after Lightspeed disconnect → resync
-- ============================================================
-- Root cause: the disconnect endpoint was deleting all products rows.
-- On resync the rows were recreated fresh, losing any product-scoped
-- curated data (display_name, product_description, marketplace
-- categories). The INSERT trigger (sync_categories_after_canonical_link)
-- should have copied canonical fields back when canonical_product_id
-- was set during the upsert, but this migration re-runs that same
-- logic as a safety net for any rows the trigger missed.
--
-- What CAN be recovered (lives on canonical_products):
--   display_name, product_description, marketplace_category,
--   marketplace_subcategory, marketplace_level_3_category, bike_surface
--
-- What CANNOT be recovered (was per-product only):
--   product_specs — must be regenerated via the
--   /api/products/generate-product-descriptions endpoint
--
-- The disconnect endpoint has been fixed (deactivate instead of delete)
-- so this data loss cannot recur going forward.
-- ============================================================

UPDATE products p
SET
  display_name              = COALESCE(cp.display_name, p.display_name, p.description),
  product_description       = COALESCE(cp.product_description, p.product_description),
  marketplace_category      = COALESCE(cp.marketplace_category, p.marketplace_category),
  marketplace_subcategory   = COALESCE(cp.marketplace_subcategory, p.marketplace_subcategory),
  marketplace_level_3_category = COALESCE(cp.marketplace_level_3_category, p.marketplace_level_3_category),
  bike_surface              = COALESCE(cp.bike_surface, p.bike_surface),
  updated_at                = NOW()
FROM canonical_products cp
WHERE p.canonical_product_id = cp.id
  AND (
    p.display_name IS NULL
    OR p.product_description IS NULL
    OR p.marketplace_category IS NULL
  );
