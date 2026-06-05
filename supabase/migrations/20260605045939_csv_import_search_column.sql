-- User-selected column for Serper image search (SKU, MPN, part number, etc.)
ALTER TABLE online_product_csv_imports
  ADD COLUMN IF NOT EXISTS search_column TEXT;

-- Optional cycling context suffix when building fallback image search queries
ALTER TABLE online_product_csv_imports
  ADD COLUMN IF NOT EXISTS image_search_bicycle_context BOOLEAN NOT NULL DEFAULT false;;
