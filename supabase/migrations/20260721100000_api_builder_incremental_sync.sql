-- Incremental sync support for Build a Table (api_builder_tables).
-- sync_kind: whether the current / last run is a full rebuild or an
-- incremental pull of recent sales. sync_columns_signature: schema signature
-- (grain + columns + formulas) the stored rows were built with — when it no
-- longer matches the saved definition, the next sync does a full rebuild.

ALTER TABLE public.api_builder_tables
  ADD COLUMN IF NOT EXISTS sync_kind TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS sync_columns_signature TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_builder_tables_sync_kind_check'
  ) THEN
    ALTER TABLE public.api_builder_tables
      ADD CONSTRAINT api_builder_tables_sync_kind_check
      CHECK (sync_kind IN ('full', 'incremental'));
  END IF;
END $$;

COMMENT ON COLUMN public.api_builder_tables.sync_kind IS
  'Whether the current/last sync run is a full rebuild or incremental pull of recent sales.';
COMMENT ON COLUMN public.api_builder_tables.sync_columns_signature IS
  'Schema signature (grain + columns + formulas) the stored rows were built with. Mismatch with the saved definition forces a full rebuild on next sync.';
