-- Bike Stores tab: store filter pills — list verified stores that have at least one
-- marketplace-ready store_inventory row (matches /api/marketplace/products?listingType=store_inventory).
-- No per-store counts (lighter than get_stores_with_product_counts).

CREATE OR REPLACE FUNCTION get_bike_stores_for_marketplace_filters()
RETURNS TABLE (
  user_id UUID,
  business_name TEXT,
  logo_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.user_id,
    u.business_name,
    u.logo_url
  FROM users u
  WHERE u.account_type = 'bicycle_store'
    AND u.bicycle_store = true
    AND EXISTS (
      SELECT 1
      FROM marketplace_ready_products mrp
      WHERE mrp.user_id = u.user_id
        AND mrp.listing_type = 'store_inventory'
    )
  ORDER BY u.business_name NULLS LAST, u.user_id;
$$;

GRANT EXECUTE ON FUNCTION get_bike_stores_for_marketplace_filters() TO authenticated, anon;

COMMENT ON FUNCTION get_bike_stores_for_marketplace_filters IS
  'Verified bike stores with at least one marketplace-ready store_inventory listing (for filter pills; no counts).';
