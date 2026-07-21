-- Per-column display label overrides for Build a Table.
-- Keys match field keys in columns (e.g. "sale.completeTime"); values are custom labels.

ALTER TABLE public.api_builder_tables
  ADD COLUMN IF NOT EXISTS column_labels JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.api_builder_tables.column_labels IS
  'Map of field key -> custom display label. Missing keys use the catalog default label.';
