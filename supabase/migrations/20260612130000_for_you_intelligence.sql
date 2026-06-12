-- ============================================================
-- For You intelligence layer
-- ============================================================
-- 1. Repair user_interactions partitions (they ended 2026-03-01, so every
--    tracking insert has silently failed since March) and automate creation.
-- 2. Broaden the interaction_type vocabulary for richer behavioural signals.
-- 3. Persistent anonymous identity (anonymous_id) on interactions.
-- 4. preference_profiles: inferred preference snapshots for users AND
--    anonymous browsers.
-- 5. recommendation_dismissals: explicit negative signals (not interested /
--    hide carousel).
-- 6. for_you_feeds: short-TTL cache of deterministic + LLM-enhanced feeds.
-- 7. merge_anonymous_behaviour(): folds anonymous history into a user account
--    at login.
-- 8. get_for_you_signals(): one-round-trip behavioural summary used by the
--    deterministic feed builder.

-- ============================================================
-- 1. Partition repair + automation
-- ============================================================

DO $$
DECLARE
  month_start DATE := DATE '2026-03-01';
  month_end DATE;
  partition_name TEXT;
BEGIN
  WHILE month_start < DATE '2027-09-01' LOOP
    month_end := month_start + INTERVAL '1 month';
    partition_name := 'user_interactions_' || TO_CHAR(month_start, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF user_interactions FOR VALUES FROM (%L) TO (%L)',
        partition_name, month_start, month_end
      );
    END IF;
    month_start := month_end;
  END LOOP;
END;
$$;

-- Keep at least 3 months of future partitions available.
CREATE OR REPLACE FUNCTION ensure_user_interactions_partitions()
RETURNS void AS $$
DECLARE
  month_start DATE;
  month_end DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  FOR i IN 0..3 LOOP
    month_start := DATE_TRUNC('month', NOW() + (i || ' months')::interval)::date;
    month_end := (month_start + INTERVAL '1 month')::date;
    partition_name := 'user_interactions_' || TO_CHAR(month_start, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF user_interactions FOR VALUES FROM (%L) TO (%L)',
        partition_name, month_start, month_end
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'ensure-user-interactions-partitions';

    PERFORM cron.schedule(
      'ensure-user-interactions-partitions',
      '10 0 1 * *', -- monthly, 00:10 on the 1st
      $job$ SELECT ensure_user_interactions_partitions(); $job$
    );
  END IF;
END;
$$;

-- ============================================================
-- 2. Broader interaction vocabulary
-- ============================================================

ALTER TABLE user_interactions
  DROP CONSTRAINT IF EXISTS user_interactions_interaction_type_check;

ALTER TABLE user_interactions
  ADD CONSTRAINT user_interactions_interaction_type_check
  CHECK (interaction_type IN (
    -- original vocabulary
    'view', 'click', 'search', 'add_to_cart', 'like', 'unlike',
    -- product surfaces
    'impression', 'gallery_view', 'photo_zoom', 'share',
    -- non-product surfaces
    'store_view', 'category_view', 'filter', 'sort', 'location_change',
    'scroll_depth',
    -- carousels
    'carousel_impression', 'carousel_click', 'carousel_dismiss',
    -- high intent
    'enquiry', 'message', 'offer', 'buy_intent',
    -- explicit negative
    'dismiss'
  ));

-- ============================================================
-- 3. Persistent anonymous identity on interactions
-- ============================================================

ALTER TABLE user_interactions
  ADD COLUMN IF NOT EXISTS anonymous_id UUID;

CREATE INDEX IF NOT EXISTS idx_user_interactions_anonymous
  ON user_interactions (anonymous_id, created_at DESC)
  WHERE anonymous_id IS NOT NULL;

-- ============================================================
-- 4. Preference profiles (users + anonymous browsers)
-- ============================================================

CREATE TABLE IF NOT EXISTS preference_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id UUID UNIQUE,
  -- Inferred preferences with confidence, e.g.
  -- { "categories": [{"value":"Bicycles","weight":12.4}], "brands": [...],
  --   "price_band": {"p25":900,"p50":1800,"p75":3200},
  --   "likely_budget": 2500, "condition": "used", ... }
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  signal_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT preference_profiles_identity CHECK (
    user_id IS NOT NULL OR anonymous_id IS NOT NULL
  )
);

ALTER TABLE preference_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preference profile" ON preference_profiles;
CREATE POLICY "Users can view own preference profile"
  ON preference_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages preference profiles" ON preference_profiles;
CREATE POLICY "Service role manages preference profiles"
  ON preference_profiles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 5. Recommendation dismissals (explicit negative signals)
-- ============================================================

CREATE TABLE IF NOT EXISTS recommendation_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id UUID,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  carousel_key TEXT,
  kind TEXT NOT NULL DEFAULT 'not_interested'
    CHECK (kind IN ('not_interested', 'hide_carousel')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recommendation_dismissals_identity CHECK (
    user_id IS NOT NULL OR anonymous_id IS NOT NULL
  ),
  CONSTRAINT recommendation_dismissals_target CHECK (
    product_id IS NOT NULL OR carousel_key IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_rec_dismissals_user
  ON recommendation_dismissals (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rec_dismissals_anon
  ON recommendation_dismissals (anonymous_id, created_at DESC)
  WHERE anonymous_id IS NOT NULL;

ALTER TABLE recommendation_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own dismissals" ON recommendation_dismissals;
CREATE POLICY "Users can view own dismissals"
  ON recommendation_dismissals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages dismissals" ON recommendation_dismissals;
CREATE POLICY "Service role manages dismissals"
  ON recommendation_dismissals FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 6. For You feed cache
-- ============================================================

CREATE TABLE IF NOT EXISTS for_you_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id UUID,
  -- [{ key, title, explanation, source, product_ids: [uuid] }]
  feed JSONB NOT NULL,
  candidate_ids UUID[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (source IN ('deterministic', 'llm')),
  model TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT for_you_feeds_identity CHECK (
    user_id IS NOT NULL OR anonymous_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_for_you_feeds_user
  ON for_you_feeds (user_id, source, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_for_you_feeds_anon
  ON for_you_feeds (anonymous_id, source, created_at DESC)
  WHERE anonymous_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_for_you_feeds_expires
  ON for_you_feeds (expires_at);

ALTER TABLE for_you_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages for_you_feeds" ON for_you_feeds;
CREATE POLICY "Service role manages for_you_feeds"
  ON for_you_feeds FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE OR REPLACE FUNCTION clean_expired_for_you_feeds()
RETURNS void AS $$
BEGIN
  DELETE FROM for_you_feeds WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'clean-expired-for-you-feeds';

    PERFORM cron.schedule(
      'clean-expired-for-you-feeds',
      '25 */6 * * *',
      $job$ SELECT clean_expired_for_you_feeds(); $job$
    );
  END IF;
END;
$$;

-- ============================================================
-- 7. Merge anonymous behaviour into a user account at login
-- ============================================================

CREATE OR REPLACE FUNCTION merge_anonymous_behaviour(p_anonymous_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_anonymous_id IS NULL THEN
    RETURN;
  END IF;

  -- Claim anonymous interactions (last 90 days is plenty for personalisation).
  UPDATE user_interactions
  SET user_id = v_user_id
  WHERE anonymous_id = p_anonymous_id
    AND user_id IS NULL
    AND created_at > NOW() - INTERVAL '90 days';

  -- Claim anonymous dismissals, dropping any that would duplicate.
  UPDATE recommendation_dismissals
  SET user_id = v_user_id
  WHERE anonymous_id = p_anonymous_id
    AND user_id IS NULL;

  -- Re-key the anonymous preference profile if the user has none yet;
  -- otherwise drop it (the user profile is rebuilt from merged events anyway).
  IF NOT EXISTS (SELECT 1 FROM preference_profiles WHERE user_id = v_user_id) THEN
    UPDATE preference_profiles
    SET user_id = v_user_id, anonymous_id = NULL, updated_at = NOW()
    WHERE anonymous_id = p_anonymous_id AND user_id IS NULL;
  ELSE
    DELETE FROM preference_profiles
    WHERE anonymous_id = p_anonymous_id AND user_id IS NULL;
  END IF;

  -- Invalidate cached feeds for both identities.
  DELETE FROM for_you_feeds
  WHERE (anonymous_id = p_anonymous_id) OR (user_id = v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION merge_anonymous_behaviour(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_anonymous_behaviour(UUID) TO authenticated;

-- ============================================================
-- 8. One-round-trip behavioural signal summary
-- ============================================================
-- Aggregates decayed, weighted engagement for an identity. Called with the
-- service-role client from the feed builder. Weights:
--   enquiry/message/offer 5, buy_intent/add_to_cart 4, like 4,
--   photo_zoom 2.5, click/gallery/carousel_click 2, view 1.5 (+ dwell bonus),
--   impression 0.1. Decay half-life ~7 days.

CREATE OR REPLACE FUNCTION get_for_you_signals(
  p_user_id UUID DEFAULT NULL,
  p_anonymous_id UUID DEFAULT NULL,
  p_session_id UUID DEFAULT NULL,
  p_days INTEGER DEFAULT 45
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_user_id IS NULL AND p_anonymous_id IS NULL AND p_session_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  WITH events AS (
    SELECT
      ui.product_id,
      ui.interaction_type,
      ui.dwell_time_seconds,
      ui.metadata,
      ui.created_at,
      (
        CASE ui.interaction_type
          WHEN 'enquiry' THEN 5.0
          WHEN 'message' THEN 5.0
          WHEN 'offer' THEN 5.0
          WHEN 'buy_intent' THEN 4.0
          WHEN 'add_to_cart' THEN 4.0
          WHEN 'like' THEN 4.0
          WHEN 'photo_zoom' THEN 2.5
          WHEN 'click' THEN 2.0
          WHEN 'gallery_view' THEN 2.0
          WHEN 'carousel_click' THEN 2.0
          WHEN 'view' THEN 1.5 + LEAST(COALESCE(ui.dwell_time_seconds, 0) / 60.0, 2.0)
          WHEN 'unlike' THEN -3.0
          WHEN 'dismiss' THEN -4.0
          WHEN 'impression' THEN 0.1
          ELSE 0.5
        END
      ) * EXP(-LN(2) * EXTRACT(EPOCH FROM (NOW() - ui.created_at)) / (7 * 86400.0))
      * CASE WHEN p_session_id IS NOT NULL AND ui.session_id = p_session_id THEN 2.0 ELSE 1.0 END
      AS weight
    FROM user_interactions ui
    WHERE ui.created_at > NOW() - (p_days || ' days')::interval
      AND (
        (p_user_id IS NOT NULL AND ui.user_id = p_user_id)
        OR (p_anonymous_id IS NOT NULL AND ui.anonymous_id = p_anonymous_id)
        OR (p_session_id IS NOT NULL AND ui.session_id = p_session_id)
      )
  ),
  product_events AS (
    SELECT
      e.product_id,
      SUM(e.weight) AS weight,
      MAX(e.created_at) AS last_at,
      COUNT(*) FILTER (WHERE e.interaction_type = 'impression') AS impressions,
      COUNT(*) FILTER (WHERE e.interaction_type IN ('click', 'view', 'gallery_view', 'photo_zoom', 'like', 'add_to_cart', 'enquiry', 'message', 'offer', 'buy_intent', 'carousel_click')) AS engagements
    FROM events e
    WHERE e.product_id IS NOT NULL
    GROUP BY e.product_id
  ),
  engaged AS (
    SELECT pe.*, p.marketplace_category, p.marketplace_subcategory,
           COALESCE(p.brand, p.manufacturer_name) AS brand,
           p.price, p.user_id AS store_id, p.pickup_location
    FROM product_events pe
    JOIN products p ON p.id = pe.product_id
  ),
  recent_products AS (
    SELECT jsonb_agg(jsonb_build_object(
      'product_id', e.product_id,
      'category', e.marketplace_category,
      'subcategory', e.marketplace_subcategory,
      'brand', e.brand,
      'price', e.price,
      'store_id', e.store_id,
      'pickup_location', e.pickup_location,
      'weight', ROUND(e.weight::numeric, 3),
      'last_at', e.last_at
    ) ORDER BY e.last_at DESC) AS v
    FROM (
      SELECT * FROM engaged WHERE engagements > 0 ORDER BY last_at DESC LIMIT 30
    ) e
  ),
  category_weights AS (
    SELECT jsonb_agg(jsonb_build_object('value', c.marketplace_category, 'weight', ROUND(c.w::numeric, 3)) ORDER BY c.w DESC) AS v
    FROM (
      SELECT marketplace_category, SUM(weight) AS w
      FROM engaged
      WHERE marketplace_category IS NOT NULL AND engagements > 0
      GROUP BY marketplace_category
      ORDER BY w DESC LIMIT 8
    ) c
  ),
  subcategory_weights AS (
    SELECT jsonb_agg(jsonb_build_object('value', s.marketplace_subcategory, 'category', s.marketplace_category, 'weight', ROUND(s.w::numeric, 3)) ORDER BY s.w DESC) AS v
    FROM (
      SELECT marketplace_subcategory, marketplace_category, SUM(weight) AS w
      FROM engaged
      WHERE marketplace_subcategory IS NOT NULL AND engagements > 0
      GROUP BY marketplace_subcategory, marketplace_category
      ORDER BY w DESC LIMIT 10
    ) s
  ),
  brand_weights AS (
    SELECT jsonb_agg(jsonb_build_object('value', b.brand, 'weight', ROUND(b.w::numeric, 3)) ORDER BY b.w DESC) AS v
    FROM (
      SELECT brand, SUM(weight) AS w
      FROM engaged
      WHERE brand IS NOT NULL AND brand <> '' AND engagements > 0
      GROUP BY brand
      ORDER BY w DESC LIMIT 8
    ) b
  ),
  store_weights AS (
    SELECT jsonb_agg(jsonb_build_object('value', st.store_id, 'weight', ROUND(st.w::numeric, 3)) ORDER BY st.w DESC) AS v
    FROM (
      SELECT store_id, SUM(weight) AS w
      FROM engaged
      WHERE store_id IS NOT NULL AND engagements > 0
      GROUP BY store_id
      ORDER BY w DESC LIMIT 6
    ) st
  ),
  price_band AS (
    SELECT jsonb_build_object(
      'p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price),
      'p50', PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY price),
      'p75', PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price),
      'n', COUNT(*)
    ) AS v
    FROM engaged
    WHERE price > 0 AND engagements > 0
  ),
  searches AS (
    SELECT jsonb_agg(q.query ORDER BY q.last_at DESC) AS v
    FROM (
      SELECT metadata ->> 'query' AS query, MAX(created_at) AS last_at
      FROM events
      WHERE interaction_type = 'search'
        AND COALESCE(metadata ->> 'query', '') <> ''
      GROUP BY metadata ->> 'query'
      ORDER BY last_at DESC LIMIT 10
    ) q
  ),
  ignored AS (
    -- Repeatedly shown, never engaged: soft suppression candidates.
    SELECT jsonb_agg(pe.product_id) AS v
    FROM product_events pe
    WHERE pe.impressions >= 4 AND pe.engagements = 0
  ),
  totals AS (
    SELECT jsonb_build_object(
      'events', COUNT(*),
      'products', COUNT(DISTINCT product_id),
      'first_at', MIN(created_at),
      'last_at', MAX(created_at)
    ) AS v
    FROM events
  )
  SELECT jsonb_build_object(
    'recent_products', COALESCE((SELECT v FROM recent_products), '[]'::jsonb),
    'categories', COALESCE((SELECT v FROM category_weights), '[]'::jsonb),
    'subcategories', COALESCE((SELECT v FROM subcategory_weights), '[]'::jsonb),
    'brands', COALESCE((SELECT v FROM brand_weights), '[]'::jsonb),
    'stores', COALESCE((SELECT v FROM store_weights), '[]'::jsonb),
    'price_band', COALESCE((SELECT v FROM price_band), '{}'::jsonb),
    'searches', COALESCE((SELECT v FROM searches), '[]'::jsonb),
    'ignored_product_ids', COALESCE((SELECT v FROM ignored), '[]'::jsonb),
    'totals', COALESCE((SELECT v FROM totals), '{}'::jsonb)
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Server-only: contains cross-identity behavioural data.
REVOKE EXECUTE ON FUNCTION get_for_you_signals(UUID, UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_for_you_signals(UUID, UUID, UUID, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION get_for_you_signals(UUID, UUID, UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_for_you_signals(UUID, UUID, UUID, INTEGER) TO service_role;

COMMENT ON TABLE preference_profiles IS
  'Inferred buying-intent profiles for logged-in users and anonymous browsers. Source of truth for events is user_interactions; this is a derived snapshot.';
COMMENT ON TABLE recommendation_dismissals IS
  'Explicit negative recommendation signals (not interested / hide carousel) for users and anonymous browsers.';
COMMENT ON TABLE for_you_feeds IS
  'Short-TTL cache of For You feed outputs (deterministic and LLM-enhanced). Product IDs are revalidated against live inventory at read time.';
