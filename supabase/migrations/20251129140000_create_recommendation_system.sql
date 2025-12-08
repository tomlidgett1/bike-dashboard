-- ============================================================
-- Enterprise Recommendation System - Phase 1
-- User Interactions, Preferences, Product Scores, and Cache
-- ============================================================

-- ============================================================
-- 1. USER INTERACTIONS TABLE (Partitioned by month)
-- ============================================================

-- Create parent table for partitioning
CREATE TABLE user_interactions (
  id UUID DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'click', 'search', 'add_to_cart', 'like', 'unlike')),
  dwell_time_seconds INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial partitions (current month and next 3 months)
CREATE TABLE user_interactions_2025_11 PARTITION OF user_interactions
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE user_interactions_2025_12 PARTITION OF user_interactions
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE user_interactions_2026_01 PARTITION OF user_interactions
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE user_interactions_2026_02 PARTITION OF user_interactions
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Indexes on partitioned table
CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id, created_at DESC);
CREATE INDEX idx_user_interactions_product_id ON user_interactions(product_id);
CREATE INDEX idx_user_interactions_session ON user_interactions(session_id);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type, created_at DESC);
CREATE INDEX idx_user_interactions_metadata ON user_interactions USING GIN (metadata);

-- Enable RLS
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_interactions
CREATE POLICY "Users can view own interactions"
  ON user_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interactions"
  ON user_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can read all for recommendation processing
CREATE POLICY "Service role full access"
  ON user_interactions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 2. USER PREFERENCES TABLE
-- ============================================================

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_categories JSONB DEFAULT '[]'::jsonb,
  favorite_price_range JSONB DEFAULT '{"min": 0, "max": 10000}'::jsonb,
  favorite_brands JSONB DEFAULT '[]'::jsonb,
  favorite_stores JSONB DEFAULT '[]'::jsonb,
  interaction_count INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_user_preferences_last_active ON user_preferences(last_active_at DESC);
CREATE INDEX idx_user_preferences_categories ON user_preferences USING GIN (favorite_categories);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on preferences"
  ON user_preferences FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. PRODUCT SCORES TABLE
-- ============================================================

CREATE TABLE product_scores (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  view_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,
  popularity_score DECIMAL(10,4) DEFAULT 0,
  trending_score DECIMAL(10,4) DEFAULT 0,
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_product_scores_popularity ON product_scores(popularity_score DESC);
CREATE INDEX idx_product_scores_trending ON product_scores(trending_score DESC);
CREATE INDEX idx_product_scores_last_interaction ON product_scores(last_interaction_at DESC);

-- Enable RLS (public read, service write)
ALTER TABLE product_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view product scores"
  ON product_scores FOR SELECT
  USING (true);

CREATE POLICY "Service role can modify product scores"
  ON product_scores FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_product_scores_updated_at
  BEFORE UPDATE ON product_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. RECOMMENDATION CACHE TABLE
-- ============================================================

CREATE TABLE recommendation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommended_products UUID[] NOT NULL,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('personalized', 'trending', 'similar', 'category_based', 'popular')),
  score DECIMAL(10,4),
  algorithm_version TEXT DEFAULT 'v1.0',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_recommendation_cache_user_id ON recommendation_cache(user_id, expires_at DESC);
CREATE INDEX idx_recommendation_cache_type ON recommendation_cache(recommendation_type);
CREATE INDEX idx_recommendation_cache_expires ON recommendation_cache(expires_at);

-- Enable RLS
ALTER TABLE recommendation_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own recommendations"
  ON recommendation_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on cache"
  ON recommendation_cache FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Function to increment product scores atomically
CREATE OR REPLACE FUNCTION increment_product_score(
  p_product_id UUID,
  p_interaction_type TEXT
)
RETURNS void AS $$
BEGIN
  -- Insert or update product_scores
  INSERT INTO product_scores (product_id, view_count, click_count, like_count, last_interaction_at)
  VALUES (
    p_product_id,
    CASE WHEN p_interaction_type = 'view' THEN 1 ELSE 0 END,
    CASE WHEN p_interaction_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN p_interaction_type = 'like' THEN 1 ELSE 0 END,
    NOW()
  )
  ON CONFLICT (product_id) DO UPDATE SET
    view_count = product_scores.view_count + CASE WHEN p_interaction_type = 'view' THEN 1 ELSE 0 END,
    click_count = product_scores.click_count + CASE WHEN p_interaction_type = 'click' THEN 1 ELSE 0 END,
    like_count = product_scores.like_count + CASE WHEN p_interaction_type = 'like' THEN 1 WHEN p_interaction_type = 'unlike' THEN -1 ELSE 0 END,
    last_interaction_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate popularity scores (run periodically)
CREATE OR REPLACE FUNCTION calculate_popularity_scores()
RETURNS void AS $$
BEGIN
  UPDATE product_scores
  SET 
    popularity_score = (
      (view_count * 1.0) +
      (click_count * 2.0) +
      (like_count * 5.0) +
      (conversion_count * 10.0)
    ) / (EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 + 1), -- Days since created + 1
    trending_score = (
      (view_count * 1.0) +
      (click_count * 2.0) +
      (like_count * 5.0) +
      (conversion_count * 10.0)
    ) * EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - last_interaction_at)) / 86400), -- Exponential decay
    updated_at = NOW()
  WHERE updated_at < NOW() - INTERVAL '15 minutes'; -- Only update stale scores
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean expired recommendation cache
CREATE OR REPLACE FUNCTION clean_expired_recommendations()
RETURNS void AS $$
BEGIN
  DELETE FROM recommendation_cache
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user preferences based on interactions
CREATE OR REPLACE FUNCTION update_user_preferences_from_interactions(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_categories JSONB;
  v_price_range JSONB;
  v_brands JSONB;
  v_stores JSONB;
  v_interaction_count INTEGER;
BEGIN
  -- Calculate favorite categories from last 30 days of interactions
  SELECT 
    COALESCE(jsonb_agg(jsonb_build_object('category', category, 'score', score) ORDER BY score DESC), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT 
      p.marketplace_category as category,
      COUNT(*) as score
    FROM user_interactions ui
    JOIN products p ON ui.product_id = p.id
    WHERE ui.user_id = p_user_id
      AND ui.created_at > NOW() - INTERVAL '30 days'
      AND p.marketplace_category IS NOT NULL
    GROUP BY p.marketplace_category
    ORDER BY score DESC
    LIMIT 10
  ) cat;

  -- Calculate price range preference
  SELECT 
    jsonb_build_object(
      'min', COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY p.price), 0),
      'max', COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY p.price), 10000)
    )
  INTO v_price_range
  FROM user_interactions ui
  JOIN products p ON ui.product_id = p.id
  WHERE ui.user_id = p_user_id
    AND ui.created_at > NOW() - INTERVAL '30 days'
    AND p.price > 0;

  -- Calculate favorite brands
  SELECT 
    COALESCE(jsonb_agg(jsonb_build_object('brand', brand, 'score', score) ORDER BY score DESC), '[]'::jsonb)
  INTO v_brands
  FROM (
    SELECT 
      p.manufacturer_name as brand,
      COUNT(*) as score
    FROM user_interactions ui
    JOIN products p ON ui.product_id = p.id
    WHERE ui.user_id = p_user_id
      AND ui.created_at > NOW() - INTERVAL '30 days'
      AND p.manufacturer_name IS NOT NULL
    GROUP BY p.manufacturer_name
    ORDER BY score DESC
    LIMIT 10
  ) brands;

  -- Calculate favorite stores
  SELECT 
    COALESCE(jsonb_agg(jsonb_build_object('store_id', store_id, 'score', score) ORDER BY score DESC), '[]'::jsonb)
  INTO v_stores
  FROM (
    SELECT 
      p.user_id as store_id,
      COUNT(*) as score
    FROM user_interactions ui
    JOIN products p ON ui.product_id = p.id
    WHERE ui.user_id = p_user_id
      AND ui.created_at > NOW() - INTERVAL '30 days'
    GROUP BY p.user_id
    ORDER BY score DESC
    LIMIT 10
  ) stores;

  -- Get total interaction count
  SELECT COUNT(*)
  INTO v_interaction_count
  FROM user_interactions
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '30 days';

  -- Upsert user preferences
  INSERT INTO user_preferences (
    user_id,
    favorite_categories,
    favorite_price_range,
    favorite_brands,
    favorite_stores,
    interaction_count,
    last_active_at,
    updated_at
  ) VALUES (
    p_user_id,
    v_categories,
    COALESCE(v_price_range, '{"min": 0, "max": 10000}'::jsonb),
    v_brands,
    v_stores,
    v_interaction_count,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    favorite_categories = EXCLUDED.favorite_categories,
    favorite_price_range = EXCLUDED.favorite_price_range,
    favorite_brands = EXCLUDED.favorite_brands,
    favorite_stores = EXCLUDED.favorite_stores,
    interaction_count = EXCLUDED.interaction_count,
    last_active_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================

-- User category preferences (refreshed hourly)
CREATE MATERIALIZED VIEW user_category_preferences AS
SELECT 
  ui.user_id,
  p.marketplace_category,
  COUNT(*) as interaction_count,
  AVG(ui.dwell_time_seconds) as avg_dwell_time,
  MAX(ui.created_at) as last_interaction
FROM user_interactions ui
JOIN products p ON ui.product_id = p.id
WHERE ui.created_at > NOW() - INTERVAL '30 days'
  AND p.marketplace_category IS NOT NULL
GROUP BY ui.user_id, p.marketplace_category;

CREATE UNIQUE INDEX idx_user_category_prefs_unique ON user_category_preferences(user_id, marketplace_category);
CREATE INDEX idx_user_category_prefs_user ON user_category_preferences(user_id);

-- Trending products view
CREATE MATERIALIZED VIEW trending_products AS
SELECT 
  p.id as product_id,
  p.description,
  p.price,
  p.marketplace_category,
  ps.trending_score,
  ps.view_count,
  ps.click_count,
  ps.like_count
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.last_interaction_at > NOW() - INTERVAL '7 days'
  AND p.is_active = true
ORDER BY ps.trending_score DESC
LIMIT 1000;

CREATE INDEX idx_trending_products_score ON trending_products(trending_score DESC);
CREATE INDEX idx_trending_products_category ON trending_products(marketplace_category);

-- Comment: Refresh these views via cron job every hour

-- ============================================================
-- 7. AUTOMATIC PARTITION MANAGEMENT
-- ============================================================

-- Function to create next month's partition
CREATE OR REPLACE FUNCTION create_next_partition()
RETURNS void AS $$
DECLARE
  next_month_start DATE;
  next_month_end DATE;
  partition_name TEXT;
BEGIN
  -- Calculate next month
  next_month_start := DATE_TRUNC('month', NOW() + INTERVAL '2 months');
  next_month_end := next_month_start + INTERVAL '1 month';
  partition_name := 'user_interactions_' || TO_CHAR(next_month_start, 'YYYY_MM');
  
  -- Check if partition exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF user_interactions FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      next_month_start,
      next_month_end
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment: Schedule this to run monthly via cron

-- ============================================================
-- 8. INITIAL DATA SEEDING
-- ============================================================

-- Create product_scores entries for all existing products
INSERT INTO product_scores (product_id)
SELECT id FROM products
WHERE NOT EXISTS (
  SELECT 1 FROM product_scores WHERE product_id = products.id
);





