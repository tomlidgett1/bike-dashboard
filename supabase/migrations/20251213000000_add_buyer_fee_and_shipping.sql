-- ============================================================
-- Add buyer fee and shipping address columns to purchases
-- ============================================================

-- Add buyer_fee column (0.5% service fee paid by buyer)
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS buyer_fee DECIMAL(10, 2) DEFAULT 0;

-- Add shipping address as JSONB
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS shipping_address JSONB;

-- Add buyer contact info
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS buyer_phone TEXT;

ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS buyer_email TEXT;

-- Add comment for documentation
COMMENT ON COLUMN purchases.buyer_fee IS 'Service fee paid by buyer (0.5% of item price)';
COMMENT ON COLUMN purchases.shipping_address IS 'Shipping address as JSON: {name, phone, line1, line2, city, state, postal_code, country}';
COMMENT ON COLUMN purchases.buyer_phone IS 'Buyer phone number from Stripe checkout';
COMMENT ON COLUMN purchases.buyer_email IS 'Buyer email from Stripe checkout';
