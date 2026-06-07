-- Storefront search term analytics for verified bike stores.
-- Records what customers search for on a store's public profile.

CREATE TABLE IF NOT EXISTS store_search_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_id UUID NOT NULL,
  session_id UUID NOT NULL,
  search_term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  device_type TEXT CHECK (device_type IS NULL OR device_type IN ('mobile', 'desktop')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(trim(search_term)) >= 2),
  CHECK (char_length(search_term) <= 120)
);

CREATE INDEX IF NOT EXISTS idx_store_search_events_store_time
  ON store_search_events(store_owner_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_search_events_store_term_time
  ON store_search_events(store_owner_id, normalized_term, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_search_events_distinct_searchers
  ON store_search_events(store_owner_id, visitor_id, occurred_at DESC);

ALTER TABLE store_search_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can view their own search events"
  ON store_search_events;

CREATE POLICY "Store owners can view their own search events"
  ON store_search_events
  FOR SELECT
  USING (auth.uid() = store_owner_id);

DROP POLICY IF EXISTS "Service role can manage store search events"
  ON store_search_events;

CREATE POLICY "Service role can manage store search events"
  ON store_search_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE store_search_events IS
  'Customer search terms on public store profiles. Owner traffic is excluded at write time and in summaries.';

CREATE OR REPLACE FUNCTION get_store_search_terms_summary(
  p_store_owner_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      GREATEST(1, LEAST(COALESCE(p_days, 30), 365))::int AS days,
      NOW() - (GREATEST(1, LEAST(COALESCE(p_days, 30), 365))::text || ' days')::interval AS period_start
  ),
  scoped AS (
    SELECT e.*
    FROM store_search_events e, bounds b
    WHERE e.store_owner_id = p_store_owner_id
      AND e.occurred_at >= b.period_start
      AND (e.user_id IS NULL OR e.user_id <> p_store_owner_id)
  ),
  summary AS (
    SELECT
      COUNT(*)::int AS total_searches,
      COUNT(DISTINCT COALESCE(user_id::text, visitor_id::text))::int AS distinct_searchers,
      COUNT(*) FILTER (WHERE result_count = 0)::int AS zero_result_searches
    FROM scoped
  ),
  terms AS (
    SELECT COALESCE(
      jsonb_agg(row_to_json(term_rows)::jsonb ORDER BY term_rows."searchCount" DESC, term_rows."lastSearchedAt" DESC),
      '[]'::jsonb
    ) AS rows
    FROM (
      SELECT
        (ARRAY_AGG(search_term ORDER BY occurred_at DESC))[1] AS term,
        COUNT(*)::int AS "searchCount",
        COUNT(DISTINCT COALESCE(user_id::text, visitor_id::text))::int AS "distinctSearchers",
        ROUND(AVG(result_count)::numeric, 1)::float AS "avgResultCount",
        COUNT(*) FILTER (WHERE result_count = 0)::int AS "zeroResultCount",
        MAX(occurred_at) AS "lastSearchedAt"
      FROM scoped
      GROUP BY normalized_term
      ORDER BY COUNT(*) DESC, MAX(occurred_at) DESC
      LIMIT 100
    ) term_rows
  )
  SELECT jsonb_build_object(
    'days', (SELECT days FROM bounds),
    'summary', jsonb_build_object(
      'totalSearches', COALESCE(summary.total_searches, 0),
      'distinctSearchers', COALESCE(summary.distinct_searchers, 0),
      'zeroResultSearches', COALESCE(summary.zero_result_searches, 0)
    ),
    'searchTerms', COALESCE((SELECT rows FROM terms), '[]'::jsonb)
  )
  FROM summary;
$$;

GRANT EXECUTE ON FUNCTION get_store_search_terms_summary(UUID, INTEGER) TO authenticated;
