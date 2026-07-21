-- Saved workbooks for the Analytics studio (/settings/store/analytics-new).
-- Each workbook stores its elements (tables/charts + queries + layout) as JSONB.

CREATE TABLE IF NOT EXISTS public.analytics_workbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled workbook',
  elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_workbooks_user
  ON public.analytics_workbooks (user_id, updated_at DESC);

ALTER TABLE public.analytics_workbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own analytics workbooks" ON public.analytics_workbooks;
CREATE POLICY "Users manage own analytics workbooks"
  ON public.analytics_workbooks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.analytics_workbooks IS
  'Sigma-style analytics workbooks built in the dashboard. Elements JSONB holds table/chart specs and grid layout.';
