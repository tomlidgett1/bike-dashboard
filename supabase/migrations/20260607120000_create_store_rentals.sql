-- ============================================================
-- Store Rentals Table
-- Links catalogue products to rental listings on the storefront
-- ============================================================

CREATE TABLE IF NOT EXISTS store_rentals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  description TEXT,
  price_per_hour NUMERIC(10, 2),
  price_per_day NUMERIC(10, 2),
  is_available BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_rentals_user_product_unique UNIQUE (user_id, product_id),
  CONSTRAINT store_rentals_has_pricing CHECK (
    price_per_hour IS NOT NULL OR price_per_day IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_store_rentals_user_id ON store_rentals(user_id);
CREATE INDEX IF NOT EXISTS idx_store_rentals_product_id ON store_rentals(product_id);
CREATE INDEX IF NOT EXISTS idx_store_rentals_active ON store_rentals(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_rentals_order ON store_rentals(user_id, display_order);

ALTER TABLE store_rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rentals" ON store_rentals;
DROP POLICY IF EXISTS "Users can insert own rentals" ON store_rentals;
DROP POLICY IF EXISTS "Users can update own rentals" ON store_rentals;
DROP POLICY IF EXISTS "Users can delete own rentals" ON store_rentals;
DROP POLICY IF EXISTS "Public can view active store rentals" ON store_rentals;

CREATE POLICY "Users can view own rentals"
  ON store_rentals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rentals"
  ON store_rentals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rentals"
  ON store_rentals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own rentals"
  ON store_rentals
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view active store rentals"
  ON store_rentals
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.user_id = store_rentals.user_id
      AND users.bicycle_store = true
    )
  );

DROP TRIGGER IF EXISTS update_store_rentals_updated_at ON store_rentals;
CREATE TRIGGER update_store_rentals_updated_at
  BEFORE UPDATE ON store_rentals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE store_rentals IS 'Products offered for hire on a bike store storefront';
COMMENT ON COLUMN store_rentals.product_id IS 'Catalogue product being offered as a rental';
COMMENT ON COLUMN store_rentals.description IS 'Optional rental-specific description override';
