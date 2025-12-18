-- ============================================================
-- Filter Trending Products by Admin Approval
-- Non-private listings (Lightspeed/store products) must be approved
-- Private listings can show without approval
-- ============================================================

-- Drop existing function
DROP FUNCTION IF EXISTS get_trending_products(INTEGER, TEXT, TEXT);

-- Recreate with approval filter
CREATE OR REPLACE FUNCTION get_trending_products(
  p_limit INTEGER DEFAULT 50,
  p_category TEXT DEFAULT NULL,
  p_listing_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  description TEXT,
  display_name TEXT,
  price NUMERIC,
  marketplace_category TEXT,
  marketplace_subcategory TEXT,
  primary_image_url TEXT,
  user_id UUID,
  listing_type TEXT,
  images JSONB,
  created_at TIMESTAMPTZ,
  trending_score NUMERIC,
  store_name TEXT,
  store_logo_url TEXT,
  use_custom_image BOOLEAN,
  custom_image_url TEXT,
  canonical_product_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.description,
    p.display_name,
    p.price,
    p.marketplace_category,
    p.marketplace_subcategory,
    p.primary_image_url,
    p.user_id,
    p.listing_type,
    p.images,
    p.created_at,
    ps.trending_score,
    u.business_name AS store_name,
    u.logo_url AS store_logo_url,
    p.use_custom_image,
    p.custom_image_url,
    p.canonical_product_id
  FROM products p
  INNER JOIN product_scores ps ON ps.product_id = p.id
  LEFT JOIN users u ON u.user_id = p.user_id
  WHERE p.is_active = true
    AND ps.trending_score > 0
    -- Filter: Private listings show always, non-private require admin approval
    AND (p.listing_type = 'private_listing' OR p.images_approved_by_admin = true)
    AND (p_category IS NULL OR p.marketplace_category = p_category)
    AND (p_listing_type IS NULL OR p.listing_type = p_listing_type)
  ORDER BY ps.trending_score DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_trending_products(INTEGER, TEXT, TEXT) TO authenticated, anon;


