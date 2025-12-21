-- Add product_description column to products table
-- This stores the AI-generated product description from web search enrichment
-- Separate from seller_notes which contains the condition assessment

ALTER TABLE products
ADD COLUMN IF NOT EXISTS product_description TEXT;

-- Add comment for documentation
COMMENT ON COLUMN products.product_description IS 'AI-generated product description from web search enrichment (specs, features, etc.)';

