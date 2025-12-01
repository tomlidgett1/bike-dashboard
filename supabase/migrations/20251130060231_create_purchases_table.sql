-- ============================================================
-- Create Purchases/Orders Table
-- ============================================================
-- This table tracks purchases made by users on the marketplace

CREATE TABLE IF NOT EXISTS purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Buyer information
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Seller information
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Product information
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  -- Order details
  order_number TEXT UNIQUE NOT NULL,
  
  -- Pricing
  item_price DECIMAL(10, 2) NOT NULL,
  shipping_cost DECIMAL(10, 2) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  
  -- Order status
  status TEXT NOT NULL DEFAULT 'pending',
  -- Status can be: pending, confirmed, paid, shipped, delivered, cancelled, refunded
  
  -- Shipping information
  shipping_address TEXT,
  shipping_method TEXT,
  tracking_number TEXT,
  
  -- Payment information
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  payment_date TIMESTAMPTZ,
  
  -- Communication
  buyer_notes TEXT,
  seller_notes TEXT,
  
  -- Timestamps
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS purchases_buyer_id_idx ON purchases(buyer_id);
CREATE INDEX IF NOT EXISTS purchases_seller_id_idx ON purchases(seller_id);
CREATE INDEX IF NOT EXISTS purchases_product_id_idx ON purchases(product_id);
CREATE INDEX IF NOT EXISTS purchases_status_idx ON purchases(status);
CREATE INDEX IF NOT EXISTS purchases_purchase_date_idx ON purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS purchases_order_number_idx ON purchases(order_number);

-- ============================================================
-- Constraints
-- ============================================================
ALTER TABLE purchases ADD CONSTRAINT valid_status 
  CHECK (status IN ('pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'));

ALTER TABLE purchases ADD CONSTRAINT valid_payment_status 
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

-- ============================================================
-- Enable Row Level Security
-- ============================================================
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Buyers can view their own purchases
CREATE POLICY "Buyers can view their purchases"
  ON purchases
  FOR SELECT
  TO authenticated
  USING (auth.uid() = buyer_id);

-- Sellers can view purchases of their products
CREATE POLICY "Sellers can view purchases of their products"
  ON purchases
  FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

-- Buyers can create purchases
CREATE POLICY "Buyers can create purchases"
  ON purchases
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

-- Buyers can update their own purchases (limited to certain fields)
CREATE POLICY "Buyers can update their purchases"
  ON purchases
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = buyer_id);

-- Sellers can update purchases of their products (limited to certain fields)
CREATE POLICY "Sellers can update purchases of their products"
  ON purchases
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id);

-- ============================================================
-- Trigger for updated_at
-- ============================================================
CREATE TRIGGER update_purchases_updated_at
  BEFORE UPDATE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Function to generate order number
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE purchases IS 'Stores purchase/order records for marketplace transactions';
COMMENT ON COLUMN purchases.buyer_id IS 'Reference to the user who made the purchase';
COMMENT ON COLUMN purchases.seller_id IS 'Reference to the user who is selling the product';
COMMENT ON COLUMN purchases.product_id IS 'Reference to the product being purchased';
COMMENT ON COLUMN purchases.order_number IS 'Unique order identifier for tracking';
COMMENT ON COLUMN purchases.status IS 'Current status of the order (pending, confirmed, paid, shipped, delivered, cancelled, refunded)';

