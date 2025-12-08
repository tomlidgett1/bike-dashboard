-- ============================================================
-- Add Keyword-Based Recommendations
-- Extract and match keywords from product titles
-- ============================================================

-- 1. Add favorite_keywords column to user_preferences
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS favorite_keywords JSONB DEFAULT '[]'::jsonb;

-- Create index for keyword searches
CREATE INDEX IF NOT EXISTS idx_user_preferences_keywords 
ON user_preferences USING GIN (favorite_keywords);

-- ============================================================
-- 2. Keyword Extraction Function
-- ============================================================

CREATE OR REPLACE FUNCTION extract_keywords_from_interactions(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_keywords JSONB;
BEGIN
  -- Extract keywords from product names user interacted with
  -- Filters out common words and focuses on brands/technical terms
  WITH word_frequency AS (
    SELECT 
      LOWER(word) as keyword,
      COUNT(*) as score,
      COUNT(DISTINCT ui.product_id) as unique_products
    FROM user_interactions ui
    JOIN products p ON ui.product_id = p.id,
    LATERAL (
      SELECT unnest(
        string_to_array(
          regexp_replace(
            COALESCE(p.display_name, p.description, ''),
            '[^a-zA-Z0-9\s]', '', 'g'
          ),
          ' '
        )
      ) as word
    ) words
    WHERE ui.user_id = p_user_id
      AND ui.created_at > NOW() - INTERVAL '30 days'
      AND ui.interaction_type IN ('view', 'click', 'like')
    GROUP BY LOWER(word)
    HAVING LENGTH(LOWER(word)) > 3  -- Ignore short words
      AND COUNT(*) >= 2  -- Must appear at least twice
      AND LOWER(word) NOT IN (
        'with', 'from', 'this', 'that', 'have', 'been', 
        'your', 'more', 'will', 'bike', 'product', 'item',
        'sale', 'good', 'great', 'best', 'new', 'used'
      )  -- Filter common filler words
    ORDER BY score DESC
    LIMIT 30  -- Top 30 keywords
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('keyword', keyword, 'score', score)
      ORDER BY score DESC
    ),
    '[]'::jsonb
  ) INTO v_keywords
  FROM word_frequency;
  
  RETURN v_keywords;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Update User Preferences Function to Include Keywords
-- ============================================================

CREATE OR REPLACE FUNCTION update_user_preferences_from_interactions(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_categories JSONB;
  v_price_range JSONB;
  v_brands JSONB;
  v_stores JSONB;
  v_keywords JSONB;
  v_interaction_count INTEGER;
BEGIN
  -- Calculate favorite categories
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

  -- Calculate price range
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

  -- Extract keywords (NEW!)
  v_keywords := extract_keywords_from_interactions(p_user_id);

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
    favorite_keywords,
    interaction_count,
    last_active_at,
    updated_at
  ) VALUES (
    p_user_id,
    v_categories,
    COALESCE(v_price_range, '{"min": 0, "max": 10000}'::jsonb),
    v_brands,
    v_stores,
    v_keywords,
    v_interaction_count,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    favorite_categories = EXCLUDED.favorite_categories,
    favorite_price_range = EXCLUDED.favorite_price_range,
    favorite_brands = EXCLUDED.favorite_brands,
    favorite_stores = EXCLUDED.favorite_stores,
    favorite_keywords = EXCLUDED.favorite_keywords,
    interaction_count = EXCLUDED.interaction_count,
    last_active_at = NOW(),
    updated_at = NOW();
    
  RAISE NOTICE 'Updated preferences for user % with % keywords', p_user_id, jsonb_array_length(v_keywords);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Test Keyword Extraction
-- ============================================================

-- Test with your user ID (will show what keywords it finds)
-- SELECT extract_keywords_from_interactions('YOUR_USER_ID'::UUID);

-- Success message
SELECT '✅ Keyword recommendation system ready!' as status;





