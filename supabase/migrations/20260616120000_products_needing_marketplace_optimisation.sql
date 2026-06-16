-- Products that are not marketplace-live (anti-join avoids huge NOT IN URL filters).
CREATE OR REPLACE VIEW products_needing_marketplace_optimisation
WITH (security_invoker = true)
AS
SELECT p.*
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM marketplace_ready_products mrp
  WHERE mrp.id = p.id
);

COMMENT ON VIEW products_needing_marketplace_optimisation IS
  'Store products that fail marketplace_ready_products eligibility (needs optimisation).';

GRANT SELECT ON products_needing_marketplace_optimisation TO authenticated;
