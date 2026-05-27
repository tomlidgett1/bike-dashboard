-- Bike store catalogue rows were synced without listing_type; the Bike Stores tab
-- filtered listing_type = 'store_inventory' only. Align data + store filter RPC
-- with verified bicycle_store sellers and marketplace-ready inventory.

UPDATE products p
SET listing_type = 'store_inventory',
    listing_source = COALESCE(p.listing_source, 'lightspeed')
FROM users u
WHERE p.user_id = u.user_id
  AND u.account_type = 'bicycle_store'
  AND u.bicycle_store = true
  AND (p.listing_type IS NULL OR p.listing_type = '')
  AND (p.listing_source IS NULL OR p.listing_source = 'lightspeed');

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
        AND (mrp.listing_type IS DISTINCT FROM 'private_listing')
    )
  ORDER BY u.business_name NULLS LAST, u.user_id;
$$;

COMMENT ON FUNCTION get_bike_stores_for_marketplace_filters IS
  'Verified bike stores with at least one marketplace-ready catalogue row (seller-based; not only listing_type=store_inventory).';
