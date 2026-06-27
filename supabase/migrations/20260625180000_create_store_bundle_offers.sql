-- ============================================================
-- Store Bundle Offers (Buy X, Get Y free)
-- ============================================================

CREATE TABLE IF NOT EXISTS store_bundle_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  buy_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  buy_service_id UUID REFERENCES store_services(id) ON DELETE SET NULL,
  free_product_ids UUID[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_bundle_offers_has_buy CHECK (
    buy_product_id IS NOT NULL OR buy_service_id IS NOT NULL
  ),
  CONSTRAINT store_bundle_offers_has_free CHECK (
    COALESCE(array_length(free_product_ids, 1), 0) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_store_bundle_offers_user_id ON store_bundle_offers(user_id);
CREATE INDEX IF NOT EXISTS idx_store_bundle_offers_active ON store_bundle_offers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_bundle_offers_expires ON store_bundle_offers(expires_at);
CREATE INDEX IF NOT EXISTS idx_store_bundle_offers_order ON store_bundle_offers(user_id, display_order);

ALTER TABLE store_bundle_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bundle offers" ON store_bundle_offers;
DROP POLICY IF EXISTS "Users can insert own bundle offers" ON store_bundle_offers;
DROP POLICY IF EXISTS "Users can update own bundle offers" ON store_bundle_offers;
DROP POLICY IF EXISTS "Users can delete own bundle offers" ON store_bundle_offers;
DROP POLICY IF EXISTS "Public can view active bundle offers" ON store_bundle_offers;

CREATE POLICY "Users can view own bundle offers"
  ON store_bundle_offers
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bundle offers"
  ON store_bundle_offers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bundle offers"
  ON store_bundle_offers
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bundle offers"
  ON store_bundle_offers
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view active bundle offers"
  ON store_bundle_offers
  FOR SELECT
  USING (
    is_active = true
    AND expires_at > NOW()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.user_id = store_bundle_offers.user_id
      AND users.bicycle_store = true
    )
  );

DROP TRIGGER IF EXISTS update_store_bundle_offers_updated_at ON store_bundle_offers;
CREATE TRIGGER update_store_bundle_offers_updated_at
  BEFORE UPDATE ON store_bundle_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE store_bundle_offers IS 'Buy X get Y free bundle offers on a bike store storefront';
COMMENT ON COLUMN store_bundle_offers.buy_product_id IS 'Product the customer must purchase';
COMMENT ON COLUMN store_bundle_offers.buy_service_id IS 'Service the customer must purchase (alternative to buy_product_id)';
COMMENT ON COLUMN store_bundle_offers.free_product_ids IS 'Products included for free with the bundle';
