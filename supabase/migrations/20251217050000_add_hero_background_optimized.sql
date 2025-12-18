-- ============================================================
-- Add hero_background_optimized column to products table
-- ============================================================
-- Tracks which products have been processed through the AI
-- e-commerce hero image system (white background, shadows, etc.)

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS hero_background_optimized BOOLEAN DEFAULT FALSE;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_products_hero_background_optimized 
  ON products(hero_background_optimized) 
  WHERE hero_background_optimized = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN products.hero_background_optimized IS 'True if product has been processed through the AI e-commerce hero image system with white background and professional shadows';


