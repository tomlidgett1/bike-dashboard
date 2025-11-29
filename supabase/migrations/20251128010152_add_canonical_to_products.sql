-- ============================================================
-- Add Canonical Product Support to Products Table
-- ============================================================
-- Links store products to canonical products for shared images

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS canonical_product_id UUID REFERENCES canonical_products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS use_custom_image BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS custom_image_url TEXT;

-- ============================================================
-- Indexes
-- ============================================================

-- Fast lookup of products by canonical product
CREATE INDEX IF NOT EXISTS idx_products_canonical 
  ON products(canonical_product_id);

-- Find products without canonical match (for matching queue)
CREATE INDEX IF NOT EXISTS idx_products_no_canonical 
  ON products(user_id, upc) 
  WHERE canonical_product_id IS NULL AND upc IS NOT NULL;

-- Find products using custom images
CREATE INDEX IF NOT EXISTS idx_products_custom_image 
  ON products(canonical_product_id, use_custom_image) 
  WHERE use_custom_image = true;

-- ============================================================
-- Function: Get Product Image URL
-- ============================================================
-- Returns the appropriate image URL for a product:
-- 1. Custom image if use_custom_image = true
-- 2. Canonical product primary image if available
-- 3. NULL if no image
CREATE OR REPLACE FUNCTION get_product_image_url(product_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_use_custom BOOLEAN;
  v_custom_url TEXT;
  v_canonical_id UUID;
  v_canonical_image TEXT;
BEGIN
  -- Get product details
  SELECT use_custom_image, custom_image_url, canonical_product_id
  INTO v_use_custom, v_custom_url, v_canonical_id
  FROM products
  WHERE id = product_id;
  
  -- Return custom image if specified
  IF v_use_custom = true AND v_custom_url IS NOT NULL THEN
    RETURN v_custom_url;
  END IF;
  
  -- Return canonical product primary image
  IF v_canonical_id IS NOT NULL THEN
    SELECT storage_path INTO v_canonical_image
    FROM product_images
    WHERE canonical_product_id = v_canonical_id
      AND is_primary = true
    LIMIT 1;
    
    RETURN v_canonical_image;
  END IF;
  
  -- No image available
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Function: Update Product Count on Canonical Product
-- ============================================================
CREATE OR REPLACE FUNCTION update_canonical_product_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT
  IF TG_OP = 'INSERT' AND NEW.canonical_product_id IS NOT NULL THEN
    UPDATE canonical_products 
    SET product_count = product_count + 1 
    WHERE id = NEW.canonical_product_id;
  
  -- Handle UPDATE (canonical_product_id changed)
  ELSIF TG_OP = 'UPDATE' THEN
    -- Decrement old canonical product
    IF OLD.canonical_product_id IS NOT NULL AND 
       (NEW.canonical_product_id IS NULL OR NEW.canonical_product_id != OLD.canonical_product_id) THEN
      UPDATE canonical_products 
      SET product_count = GREATEST(0, product_count - 1)
      WHERE id = OLD.canonical_product_id;
    END IF;
    
    -- Increment new canonical product
    IF NEW.canonical_product_id IS NOT NULL AND 
       (OLD.canonical_product_id IS NULL OR NEW.canonical_product_id != OLD.canonical_product_id) THEN
      UPDATE canonical_products 
      SET product_count = product_count + 1 
      WHERE id = NEW.canonical_product_id;
    END IF;
  
  -- Handle DELETE
  ELSIF TG_OP = 'DELETE' AND OLD.canonical_product_id IS NOT NULL THEN
    UPDATE canonical_products 
    SET product_count = GREATEST(0, product_count - 1)
    WHERE id = OLD.canonical_product_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_count_on_canonical_link
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_canonical_product_count();

-- ============================================================
-- View: Products with Image URLs
-- ============================================================
-- Materialized view for faster marketplace queries
CREATE MATERIALIZED VIEW IF NOT EXISTS products_with_images AS
SELECT 
  p.*,
  CASE 
    WHEN p.use_custom_image = true THEN p.custom_image_url
    ELSE pi.storage_path
  END AS resolved_image_url,
  pi.variants AS image_variants,
  pi.formats AS image_formats,
  cp.normalized_name AS canonical_name
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
LEFT JOIN product_images pi ON cp.id = pi.canonical_product_id AND pi.is_primary = true
WHERE p.is_active = true;

-- Index on the materialized view
CREATE INDEX IF NOT EXISTS idx_products_with_images_user 
  ON products_with_images(user_id);

CREATE INDEX IF NOT EXISTS idx_products_with_images_marketplace 
  ON products_with_images(marketplace_category, marketplace_subcategory);

-- ============================================================
-- Function: Refresh Products with Images View
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_products_with_images()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY products_with_images;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Comments for Documentation
-- ============================================================
COMMENT ON COLUMN products.canonical_product_id IS 'Link to canonical product for shared images and data';
COMMENT ON COLUMN products.use_custom_image IS 'If true, use custom_image_url instead of canonical product image';
COMMENT ON COLUMN products.custom_image_url IS 'Store-specific custom image URL (overrides canonical)';
COMMENT ON FUNCTION get_product_image_url IS 'Returns the appropriate image URL for a product (custom or canonical)';





