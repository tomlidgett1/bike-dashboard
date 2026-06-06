-- Column used as the reference key for CSV duplicate detection
ALTER TABLE online_product_csv_imports
  ADD COLUMN IF NOT EXISTS duplicate_column TEXT;
