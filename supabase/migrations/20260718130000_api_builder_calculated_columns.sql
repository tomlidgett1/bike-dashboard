-- User-defined calculated columns (formulas) for Build a Table.
-- Each entry: { key, label, expression, type?, format? }

ALTER TABLE public.api_builder_tables
  ADD COLUMN IF NOT EXISTS calculated_columns JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.api_builder_tables.calculated_columns IS
  'Array of calculated column definitions: key, label, expression, optional type/format.';
