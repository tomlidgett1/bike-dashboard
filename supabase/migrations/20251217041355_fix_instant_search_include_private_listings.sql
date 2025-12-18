-- ============================================================
-- Fix Instant Search to Include Private Listings
-- ============================================================
-- The instant_search_products function was missing columns needed
-- for private listings to appear in search results:
-- - listing_type: to identify private vs store inventory
-- - images: JSONB array with image data for private listings
-- - cached_image_url: pre-cached Cloudinary image URL
-- - cached_thumbnail_url: pre-cached thumbnail URL
-- ============================================================

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS instant_search_products(TEXT, INT);

CREATE OR REPLACE FUNCTION instant_search_products(
  search_query TEXT,
  max_results INT DEFAULT 10
)
RETURNS TABLE (
  product_id UUID,
  display_name TEXT,
  description TEXT,
  price DECIMAL,
  marketplace_category TEXT,
  qoh INTEGER,
  use_custom_image BOOLEAN,
  custom_image_url TEXT,
  primary_image_url TEXT,
  canonical_product_id UUID,
  business_name TEXT,
  relevance_score FLOAT,
  -- Added columns for private listings support
  listing_type TEXT,
  images JSONB,
  cached_image_url TEXT,
  cached_thumbnail_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS product_id,
    p.display_name,
    p.description,
    p.price,
    p.marketplace_category,
    p.qoh,
    p.use_custom_image,
    p.custom_image_url,
    p.primary_image_url,
    p.canonical_product_id,
    u.business_name,
    -- Simplified relevance scoring for speed
    (
      -- Exact prefix match gets highest priority
      CASE WHEN p.display_name ILIKE search_query || '%' THEN 100.0
           WHEN p.description ILIKE search_query || '%' THEN 50.0
           ELSE 0.0 END +
      -- Substring match
      CASE WHEN p.display_name ILIKE '%' || search_query || '%' THEN 10.0 ELSE 0.0 END +
      -- Trigram similarity (fast fuzzy matching)
      COALESCE(similarity(p.display_name, search_query) * 20, 0)
    ) AS relevance_score,
    -- Private listings support columns
    p.listing_type,
    p.images,
    p.cached_image_url,
    p.cached_thumbnail_url
  FROM products p
  LEFT JOIN users u ON u.user_id = p.user_id
  WHERE 
    p.is_active = true
    AND (p.listing_status IS NULL OR p.listing_status = 'active')
    AND (
      -- Fast ILIKE patterns (uses GIN index)
      p.display_name ILIKE '%' || search_query || '%'
      OR p.description ILIKE '%' || search_query || '%'
      OR similarity(p.display_name, search_query) > 0.2
    )
  ORDER BY relevance_score DESC, p.created_at DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION instant_search_products TO anon, authenticated;

-- Performance comment
COMMENT ON FUNCTION instant_search_products IS 'Ultra-fast instant search - now includes private listings with cached images';

