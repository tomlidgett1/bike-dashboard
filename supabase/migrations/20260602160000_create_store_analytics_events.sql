-- Storefront analytics for verified bike stores.
-- Tracks public store visits, product page views, and product impressions
-- without storing IP addresses or user-agent strings.

CREATE TABLE IF NOT EXISTS store_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_id UUID NOT NULL,
  session_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('store_page_view', 'product_view', 'product_impression')
  ),
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_store_time
  ON store_analytics_events(store_owner_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_store_type_time
  ON store_analytics_events(store_owner_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_product_time
  ON store_analytics_events(product_id, occurred_at DESC)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_distinct_visitors
  ON store_analytics_events(store_owner_id, visitor_id, occurred_at DESC);

ALTER TABLE store_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can view their own analytics events"
  ON store_analytics_events;

CREATE POLICY "Store owners can view their own analytics events"
  ON store_analytics_events
  FOR SELECT
  USING (auth.uid() = store_owner_id);

DROP POLICY IF EXISTS "Service role can manage store analytics events"
  ON store_analytics_events;

CREATE POLICY "Service role can manage store analytics events"
  ON store_analytics_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE store_analytics_events IS
  'Privacy-aware storefront analytics events. Distinct visitors are counted from authenticated user_id when available and anonymous browser visitor_id otherwise; IP addresses are not stored.';

CREATE OR REPLACE FUNCTION get_store_analytics_summary(
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
    FROM store_analytics_events e, bounds b
    WHERE e.store_owner_id = p_store_owner_id
      AND e.occurred_at >= b.period_start
  ),
  summary AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'store_page_view')::int AS store_views,
      COUNT(DISTINCT COALESCE(user_id::text, visitor_id::text)) FILTER (WHERE event_type = 'store_page_view')::int AS store_distinct_users,
      COUNT(*) FILTER (WHERE event_type = 'product_view')::int AS product_views,
      COUNT(DISTINCT COALESCE(user_id::text, visitor_id::text)) FILTER (WHERE event_type = 'product_view')::int AS product_distinct_users,
      COUNT(*) FILTER (WHERE event_type = 'product_impression')::int AS product_impressions,
      COUNT(DISTINCT COALESCE(user_id::text, visitor_id::text)) FILTER (WHERE event_type = 'product_impression')::int AS impression_distinct_users,
      COUNT(*) FILTER (WHERE event_type IN ('store_page_view', 'product_view'))::int AS total_views,
      COUNT(DISTINCT COALESCE(user_id::text, visitor_id::text)) FILTER (WHERE event_type IN ('store_page_view', 'product_view'))::int AS total_distinct_users
    FROM scoped
  ),
  daily AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', d.day::date,
        'storeViews', COALESCE(a.store_views, 0),
        'productViews', COALESCE(a.product_views, 0),
        'impressions', COALESCE(a.impressions, 0),
        'distinctUsers', COALESCE(a.distinct_users, 0)
      )
      ORDER BY d.day
    ) AS rows
    FROM bounds b
    CROSS JOIN generate_series(
      date_trunc('day', b.period_start),
      date_trunc('day', NOW()),
      interval '1 day'
    ) d(day)
    LEFT JOIN (
      SELECT
        date_trunc('day', occurred_at) AS day,
        COUNT(*) FILTER (WHERE event_type = 'store_page_view')::int AS store_views,
        COUNT(*) FILTER (WHERE event_type = 'product_view')::int AS product_views,
        COUNT(*) FILTER (WHERE event_type = 'product_impression')::int AS impressions,
        COUNT(DISTINCT COALESCE(user_id::text, visitor_id::text))::int AS distinct_users
      FROM scoped
      GROUP BY 1
    ) a ON a.day = d.day
  ),
  top_products AS (
    SELECT COALESCE(jsonb_agg(row_to_json(product_rows)::jsonb ORDER BY product_rows.views DESC, product_rows.impressions DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT
        e.product_id AS "productId",
        COALESCE(NULLIF(p.display_name, ''), p.description, 'Untitled product') AS name,
        p.price,
        p.primary_image_url AS "imageUrl",
        COUNT(*) FILTER (WHERE e.event_type = 'product_view')::int AS views,
        COUNT(DISTINCT COALESCE(e.user_id::text, e.visitor_id::text)) FILTER (WHERE e.event_type = 'product_view')::int AS "distinctUsers",
        COUNT(*) FILTER (WHERE e.event_type = 'product_impression')::int AS impressions,
        MAX(e.occurred_at) FILTER (WHERE e.event_type = 'product_view') AS "lastViewedAt"
      FROM scoped e
      JOIN products p ON p.id = e.product_id AND p.user_id = p_store_owner_id
      WHERE e.product_id IS NOT NULL
        AND e.event_type IN ('product_view', 'product_impression')
      GROUP BY e.product_id, p.display_name, p.description, p.price, p.primary_image_url
      ORDER BY views DESC, impressions DESC
      LIMIT 20
    ) product_rows
  )
  SELECT jsonb_build_object(
    'days', (SELECT days FROM bounds),
    'summary', jsonb_build_object(
      'storeViews', COALESCE(summary.store_views, 0),
      'storeDistinctUsers', COALESCE(summary.store_distinct_users, 0),
      'productViews', COALESCE(summary.product_views, 0),
      'productDistinctUsers', COALESCE(summary.product_distinct_users, 0),
      'productImpressions', COALESCE(summary.product_impressions, 0),
      'impressionDistinctUsers', COALESCE(summary.impression_distinct_users, 0),
      'totalViews', COALESCE(summary.total_views, 0),
      'totalDistinctUsers', COALESCE(summary.total_distinct_users, 0)
    ),
    'daily', COALESCE((SELECT rows FROM daily), '[]'::jsonb),
    'topProducts', COALESCE((SELECT rows FROM top_products), '[]'::jsonb)
  )
  FROM summary;
$$;

GRANT EXECUTE ON FUNCTION get_store_analytics_summary(UUID, INTEGER) TO authenticated;
