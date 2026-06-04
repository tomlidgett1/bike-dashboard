-- Persisted CSV imports for online product catalog workflow

CREATE TABLE IF NOT EXISTS online_product_csv_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  row_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS online_product_csv_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES online_product_csv_imports(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  display_label TEXT NOT NULL,
  raw_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'selected', 'enriched', 'skipped', 'duplicate', 'created')),
  enriched JSONB,
  duplicate_of_id UUID REFERENCES products(id) ON DELETE SET NULL,
  duplicate_of_name TEXT,
  skip_reason TEXT,
  created_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_online_csv_imports_user_id
  ON online_product_csv_imports(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_online_csv_rows_import_id
  ON online_product_csv_rows(import_id, row_index);

ALTER TABLE online_product_csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_product_csv_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "online_csv_imports_owner_all"
  ON online_product_csv_imports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "online_csv_rows_owner_all"
  ON online_product_csv_rows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM online_product_csv_imports i
      WHERE i.id = import_id AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM online_product_csv_imports i
      WHERE i.id = import_id AND i.user_id = user_id
    )
  );

CREATE OR REPLACE FUNCTION update_online_csv_imports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER online_csv_imports_updated_at
  BEFORE UPDATE ON online_product_csv_imports
  FOR EACH ROW EXECUTE FUNCTION update_online_csv_imports_updated_at();

CREATE TRIGGER online_csv_rows_updated_at
  BEFORE UPDATE ON online_product_csv_rows
  FOR EACH ROW EXECUTE FUNCTION update_online_csv_imports_updated_at();
