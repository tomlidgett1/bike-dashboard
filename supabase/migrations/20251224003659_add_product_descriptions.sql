-- ============================================================
-- Add Product Descriptions to Canonical Products
-- ============================================================
-- This migration adds product description columns to canonical_products
-- and creates a queue table for background description generation using
-- OpenAI GPT with web search.

-- ============================================================
-- Step 1: Add product_description columns to canonical_products
-- ============================================================

ALTER TABLE canonical_products 
ADD COLUMN IF NOT EXISTS product_description TEXT;

ALTER TABLE canonical_products 
ADD COLUMN IF NOT EXISTS description_generated_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN canonical_products.product_description IS 'AI-generated detailed product specifications from web search';
COMMENT ON COLUMN canonical_products.description_generated_at IS 'Timestamp when the product description was generated';

-- ============================================================
-- Step 2: Add product_description column to products table
-- ============================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS product_description TEXT;

COMMENT ON COLUMN products.product_description IS 'Product description synced from canonical_products';

-- ============================================================
-- Step 3: Create description_generation_queue table
-- ============================================================

CREATE TABLE IF NOT EXISTS description_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Canonical product reference
  canonical_product_id UUID NOT NULL REFERENCES canonical_products(id) ON DELETE CASCADE,
  
  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timing
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Audit
  created_by UUID REFERENCES auth.users(id),
  
  -- Prevent duplicate queue items for the same canonical product
  CONSTRAINT unique_canonical_product_queue UNIQUE (canonical_product_id)
);

-- ============================================================
-- Step 4: Indexes for description_generation_queue
-- ============================================================

-- Fast lookup of pending items for queue processing
CREATE INDEX IF NOT EXISTS idx_desc_queue_pending 
  ON description_generation_queue(status, created_at ASC) 
  WHERE status = 'pending';

-- Fast lookup of processing items (for timeout detection)
CREATE INDEX IF NOT EXISTS idx_desc_queue_processing 
  ON description_generation_queue(status, processing_started_at) 
  WHERE status = 'processing';

-- Lookup by canonical product
CREATE INDEX IF NOT EXISTS idx_desc_queue_canonical 
  ON description_generation_queue(canonical_product_id);

-- Lookup by creator
CREATE INDEX IF NOT EXISTS idx_desc_queue_created_by 
  ON description_generation_queue(created_by, created_at DESC);

-- ============================================================
-- Step 5: Enable RLS on description_generation_queue
-- ============================================================

ALTER TABLE description_generation_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Step 6: RLS Policies for description_generation_queue
-- ============================================================

-- Authenticated users can view all queue items (admin feature)
CREATE POLICY "Authenticated users can view description queue"
  ON description_generation_queue FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert queue items
CREATE POLICY "Authenticated users can insert to description queue"
  ON description_generation_queue FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update queue items
CREATE POLICY "Authenticated users can update description queue"
  ON description_generation_queue FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role can delete (for cleanup)
CREATE POLICY "Service role can delete from description queue"
  ON description_generation_queue FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- Step 7: Index for canonical products with/without descriptions
-- ============================================================

-- Index for quickly finding products without descriptions
CREATE INDEX IF NOT EXISTS idx_canonical_no_description 
  ON canonical_products(id) 
  WHERE product_description IS NULL;

-- Index for quickly finding products with descriptions
CREATE INDEX IF NOT EXISTS idx_canonical_has_description 
  ON canonical_products(description_generated_at DESC) 
  WHERE product_description IS NOT NULL;

-- ============================================================
-- Step 8: Update sync trigger to include product_description
-- ============================================================

-- Update the function that syncs from canonical to products when product is linked
CREATE OR REPLACE FUNCTION sync_categories_from_canonical()
RETURNS TRIGGER AS $$
BEGIN
  -- When a product is linked to a canonical product (INSERT or UPDATE)
  -- Copy categories, display_name, and product_description from canonical to product
  -- BUT ONLY if canonical has values set (don't overwrite with NULL)
  IF NEW.canonical_product_id IS NOT NULL THEN
    UPDATE products
    SET 
      marketplace_category = COALESCE(cp.marketplace_category, products.marketplace_category),
      marketplace_subcategory = COALESCE(cp.marketplace_subcategory, products.marketplace_subcategory),
      marketplace_level_3_category = COALESCE(cp.marketplace_level_3_category, products.marketplace_level_3_category),
      display_name = COALESCE(cp.display_name, products.display_name, products.description),
      product_description = COALESCE(cp.product_description, products.product_description),
      updated_at = NOW()
    FROM canonical_products cp
    WHERE products.id = NEW.id
      AND cp.id = NEW.canonical_product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update the function that propagates changes from canonical to all linked products
CREATE OR REPLACE FUNCTION propagate_canonical_category_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only propagate if categories or description actually changed
  IF (NEW.marketplace_category IS DISTINCT FROM OLD.marketplace_category) OR
     (NEW.marketplace_subcategory IS DISTINCT FROM OLD.marketplace_subcategory) OR
     (NEW.marketplace_level_3_category IS DISTINCT FROM OLD.marketplace_level_3_category) OR
     (NEW.display_name IS DISTINCT FROM OLD.display_name) OR
     (NEW.product_description IS DISTINCT FROM OLD.product_description) THEN
    
    -- Update all products linked to this canonical product
    UPDATE products
    SET 
      marketplace_category = NEW.marketplace_category,
      marketplace_subcategory = NEW.marketplace_subcategory,
      marketplace_level_3_category = NEW.marketplace_level_3_category,
      display_name = COALESCE(NEW.display_name, products.description),
      product_description = NEW.product_description,
      updated_at = NOW()
    WHERE canonical_product_id = NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger to include product_description in the watched columns
DROP TRIGGER IF EXISTS propagate_categories_to_products ON canonical_products;
CREATE TRIGGER propagate_categories_to_products
  AFTER UPDATE OF marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name, product_description ON canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION propagate_canonical_category_updates();

-- ============================================================
-- Step 9: Comments for documentation
-- ============================================================

COMMENT ON TABLE description_generation_queue IS 'Queue for background generation of product descriptions using AI web search';
COMMENT ON FUNCTION sync_categories_from_canonical() IS 'Syncs categories, display_name, and product_description from canonical_products to products';
COMMENT ON FUNCTION propagate_canonical_category_updates() IS 'Propagates category and description updates from canonical_products to all linked products';

