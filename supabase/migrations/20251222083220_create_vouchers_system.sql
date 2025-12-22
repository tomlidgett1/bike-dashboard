-- ============================================================
-- Create Vouchers System
-- ============================================================
-- This migration creates the vouchers table and trigger for the
-- first product upload promotion: $10 off purchases $30+

-- ============================================================
-- Vouchers Table
-- ============================================================

CREATE TABLE IF NOT EXISTS vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Owner of the voucher
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Type of voucher (e.g., 'first_upload', 'referral', 'promo')
  voucher_type TEXT NOT NULL DEFAULT 'first_upload',
  
  -- Discount amount in cents (1000 = $10.00 AUD)
  amount_cents INTEGER NOT NULL DEFAULT 1000,
  
  -- Minimum purchase amount required in cents (3000 = $30.00 AUD)
  min_purchase_cents INTEGER NOT NULL DEFAULT 3000,
  
  -- Voucher status: active, used, expired, cancelled
  status TEXT NOT NULL DEFAULT 'active',
  
  -- When the voucher was used
  used_at TIMESTAMPTZ,
  
  -- Which purchase used this voucher
  used_on_purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  
  -- Optional expiration date (NULL = never expires)
  expires_at TIMESTAMPTZ,
  
  -- Stripe coupon/promotion code ID (for tracking)
  stripe_coupon_id TEXT,
  stripe_promotion_code_id TEXT,
  
  -- Description for display
  description TEXT DEFAULT 'First listing reward - $10 off your next purchase',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS vouchers_user_id_idx ON vouchers(user_id);
CREATE INDEX IF NOT EXISTS vouchers_status_idx ON vouchers(status);
CREATE INDEX IF NOT EXISTS vouchers_type_idx ON vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS vouchers_user_type_idx ON vouchers(user_id, voucher_type);
CREATE INDEX IF NOT EXISTS vouchers_active_idx ON vouchers(user_id, status) WHERE status = 'active';

-- ============================================================
-- Constraints
-- ============================================================

ALTER TABLE vouchers ADD CONSTRAINT valid_voucher_status 
  CHECK (status IN ('active', 'used', 'expired', 'cancelled'));

ALTER TABLE vouchers ADD CONSTRAINT valid_voucher_type 
  CHECK (voucher_type IN ('first_upload', 'referral', 'promo', 'compensation'));

ALTER TABLE vouchers ADD CONSTRAINT positive_amount 
  CHECK (amount_cents > 0);

ALTER TABLE vouchers ADD CONSTRAINT non_negative_min_purchase 
  CHECK (min_purchase_cents >= 0);

-- ============================================================
-- Enable Row Level Security
-- ============================================================

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can view their own vouchers
CREATE POLICY "Users can view their own vouchers"
  ON vouchers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage all vouchers (for webhooks/triggers)
CREATE POLICY "Service role can manage vouchers"
  ON vouchers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users cannot directly create vouchers (only via trigger/API)
-- Vouchers are created by the system, not directly by users

-- ============================================================
-- Trigger for updated_at
-- ============================================================

CREATE TRIGGER update_vouchers_updated_at
  BEFORE UPDATE ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Function to Create First Upload Voucher
-- ============================================================
-- This function is called after a product is inserted to check
-- if it's the user's first listing and award the voucher

CREATE OR REPLACE FUNCTION create_first_upload_voucher()
RETURNS TRIGGER AS $$
DECLARE
  existing_voucher_count INTEGER;
  existing_product_count INTEGER;
BEGIN
  -- Only process if this is an active/published listing
  IF NEW.listing_status NOT IN ('active', 'published') AND NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Check if user already has a first_upload voucher
  SELECT COUNT(*) INTO existing_voucher_count
  FROM vouchers
  WHERE user_id = NEW.user_id
    AND voucher_type = 'first_upload';

  -- If user already has this voucher type, skip
  IF existing_voucher_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Count existing active products for this user (excluding current)
  SELECT COUNT(*) INTO existing_product_count
  FROM products
  WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND (listing_status IN ('active', 'published', 'sold') OR is_active = TRUE);

  -- If this is their first product, create the voucher
  IF existing_product_count = 0 THEN
    INSERT INTO vouchers (
      user_id,
      voucher_type,
      amount_cents,
      min_purchase_cents,
      status,
      description
    ) VALUES (
      NEW.user_id,
      'first_upload',
      1000,  -- $10.00
      3000,  -- Minimum $30.00 purchase
      'active',
      'Congratulations on your first listing! Enjoy $10 off your next purchase over $30.'
    );
    
    RAISE NOTICE 'Created first_upload voucher for user %', NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Trigger on Products Insert
-- ============================================================
-- Note: We also check on UPDATE in case a draft becomes active

CREATE TRIGGER trigger_first_upload_voucher_on_insert
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION create_first_upload_voucher();

CREATE TRIGGER trigger_first_upload_voucher_on_update
  AFTER UPDATE ON products
  FOR EACH ROW
  WHEN (
    (OLD.listing_status IS DISTINCT FROM NEW.listing_status OR OLD.is_active IS DISTINCT FROM NEW.is_active)
    AND (NEW.listing_status IN ('active', 'published') OR NEW.is_active = TRUE)
  )
  EXECUTE FUNCTION create_first_upload_voucher();

-- ============================================================
-- Function to Get User's Active Voucher for Checkout
-- ============================================================

CREATE OR REPLACE FUNCTION get_applicable_voucher(
  p_user_id UUID,
  p_purchase_amount_cents INTEGER
)
RETURNS TABLE (
  voucher_id UUID,
  discount_cents INTEGER,
  voucher_type TEXT,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.amount_cents,
    v.voucher_type,
    v.description
  FROM vouchers v
  WHERE v.user_id = p_user_id
    AND v.status = 'active'
    AND v.min_purchase_cents <= p_purchase_amount_cents
    AND (v.expires_at IS NULL OR v.expires_at > NOW())
  ORDER BY v.amount_cents DESC, v.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Function to Mark Voucher as Used
-- ============================================================

CREATE OR REPLACE FUNCTION use_voucher(
  p_voucher_id UUID,
  p_purchase_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE vouchers
  SET 
    status = 'used',
    used_at = NOW(),
    used_on_purchase_id = p_purchase_id,
    updated_at = NOW()
  WHERE id = p_voucher_id
    AND status = 'active';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Add voucher_id to purchases table (for tracking)
-- ============================================================

ALTER TABLE purchases 
  ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL;

ALTER TABLE purchases 
  ADD COLUMN IF NOT EXISTS voucher_discount DECIMAL(10, 2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS purchases_voucher_id_idx ON purchases(voucher_id);

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE vouchers IS 'Stores promotional vouchers for marketplace discounts';
COMMENT ON COLUMN vouchers.user_id IS 'The user who owns this voucher';
COMMENT ON COLUMN vouchers.voucher_type IS 'Type of voucher: first_upload, referral, promo, compensation';
COMMENT ON COLUMN vouchers.amount_cents IS 'Discount amount in cents (1000 = $10 AUD)';
COMMENT ON COLUMN vouchers.min_purchase_cents IS 'Minimum purchase required to use voucher (3000 = $30 AUD)';
COMMENT ON COLUMN vouchers.status IS 'Voucher status: active, used, expired, cancelled';
COMMENT ON FUNCTION create_first_upload_voucher() IS 'Automatically creates a $10 voucher when user lists their first product';
COMMENT ON FUNCTION get_applicable_voucher(UUID, INTEGER) IS 'Returns the best applicable voucher for a user and purchase amount';
COMMENT ON FUNCTION use_voucher(UUID, UUID) IS 'Marks a voucher as used and links it to a purchase';

