-- Resume cursor + progress counters for background Build a Table sync.

ALTER TABLE public.api_builder_tables
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT,
  ADD COLUMN IF NOT EXISTS sync_sales_fetched INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.api_builder_tables.sync_cursor IS
  'Lightspeed Sale API next-page cursor URL while a background sync is in progress.';
COMMENT ON COLUMN public.api_builder_tables.sync_sales_fetched IS
  'Cumulative sales pulled into this table during the current sync run.';
