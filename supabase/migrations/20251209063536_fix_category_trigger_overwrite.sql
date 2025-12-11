-- ============================================================
-- Fix Category Sync Trigger to Not Overwrite with NULL
-- ============================================================
-- The trigger was overwriting manually-set marketplace_category
-- with NULL from canonical_products. This fixes it to only
-- copy categories if they exist in canonical.

CREATE OR REPLACE FUNCTION sync_categories_from_canonical()
RETURNS TRIGGER AS $$
BEGIN
  -- When a product is linked to a canonical product (INSERT or UPDATE)
  -- Copy categories and display_name from canonical to product
  -- BUT ONLY if canonical has categories set (don't overwrite with NULL)
  IF NEW.canonical_product_id IS NOT NULL THEN
    UPDATE products
    SET 
      marketplace_category = COALESCE(cp.marketplace_category, products.marketplace_category),
      marketplace_subcategory = COALESCE(cp.marketplace_subcategory, products.marketplace_subcategory),
      marketplace_level_3_category = COALESCE(cp.marketplace_level_3_category, products.marketplace_level_3_category),
      display_name = COALESCE(cp.display_name, products.display_name, products.description),
      updated_at = NOW()
    FROM canonical_products cp
    WHERE products.id = NEW.id
      AND cp.id = NEW.canonical_product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comment explaining the fix
COMMENT ON FUNCTION sync_categories_from_canonical() IS 'Syncs categories from canonical_products to products, but preserves product categories if canonical has NULL (for manual listings)';


