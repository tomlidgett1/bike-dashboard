-- ============================================================
-- Get Distinct Filter Options for Image QA
-- ============================================================
-- This function returns all unique values for category filters
-- in a single, efficient query.

CREATE OR REPLACE FUNCTION get_canonical_filter_options()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'categories', (
      SELECT json_agg(DISTINCT marketplace_category ORDER BY marketplace_category)
      FROM canonical_products
      WHERE marketplace_category IS NOT NULL
    ),
    'subcategories', (
      SELECT json_agg(DISTINCT marketplace_subcategory ORDER BY marketplace_subcategory)
      FROM canonical_products
      WHERE marketplace_subcategory IS NOT NULL
    ),
    'level3_categories', (
      SELECT json_agg(DISTINCT marketplace_level_3_category ORDER BY marketplace_level_3_category)
      FROM canonical_products
      WHERE marketplace_level_3_category IS NOT NULL
    ),
    'manufacturers', (
      SELECT json_agg(DISTINCT manufacturer ORDER BY manufacturer)
      FROM canonical_products
      WHERE manufacturer IS NOT NULL
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_canonical_filter_options() TO authenticated;
GRANT EXECUTE ON FUNCTION get_canonical_filter_options() TO anon;

