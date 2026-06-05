-- User-selected stock-on-hand column for CSV imports
ALTER TABLE online_product_csv_imports
  ADD COLUMN IF NOT EXISTS soh_column TEXT;;
