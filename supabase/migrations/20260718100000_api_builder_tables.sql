-- Saved custom tables built from Lightspeed API field pickers
-- (Build a Table at /settings/store/build-table).

CREATE TABLE IF NOT EXISTS public.api_builder_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled table',
  source TEXT NOT NULL DEFAULT 'sales',
  grain TEXT NOT NULL DEFAULT 'sale_line',
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT api_builder_tables_source_check CHECK (source IN ('sales')),
  CONSTRAINT api_builder_tables_grain_check CHECK (grain IN ('sale', 'sale_line'))
);

CREATE INDEX IF NOT EXISTS idx_api_builder_tables_user
  ON public.api_builder_tables (user_id, updated_at DESC);

ALTER TABLE public.api_builder_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own api builder tables" ON public.api_builder_tables;
CREATE POLICY "Users manage own api builder tables"
  ON public.api_builder_tables
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.api_builder_tables IS
  'Custom data tables built by picking Lightspeed R-Series API fields. Columns JSONB is an ordered list of field keys.';
