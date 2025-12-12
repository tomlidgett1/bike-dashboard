-- ============================================================
-- Add Stripe Connect Fields for Seller Payouts
-- ============================================================
-- Enables sellers to connect their Stripe accounts and receive
-- payouts for sales on Yellow Jersey marketplace

-- ============================================================
-- Stripe Connect Fields on Users Table
-- ============================================================

-- Stripe Connect account ID (acct_xxx)
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

-- Account status for UI display
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_status TEXT DEFAULT 'not_connected';

-- Onboarding completion flags
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN DEFAULT false;

-- When they connected their account
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_connected_at TIMESTAMPTZ;

-- Status constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_stripe_status;
ALTER TABLE users ADD CONSTRAINT valid_stripe_status 
  CHECK (stripe_account_status IN ('not_connected', 'pending', 'active', 'restricted', 'disabled'));

-- Index for quick lookups by Stripe account ID
CREATE INDEX IF NOT EXISTS users_stripe_account_idx 
  ON users(stripe_account_id) 
  WHERE stripe_account_id IS NOT NULL;

-- ============================================================
-- Escrow/Funds Hold Fields on Purchases Table
-- ============================================================

-- Funds status for escrow system
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS funds_status TEXT DEFAULT 'held';

-- When funds should auto-release (7 days after purchase)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS funds_release_at TIMESTAMPTZ;

-- When buyer confirmed receipt
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ;

-- When payout was triggered to seller
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payout_triggered_at TIMESTAMPTZ;

-- Stripe transfer ID for the payout
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

-- Funds status constraint
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS valid_funds_status;
ALTER TABLE purchases ADD CONSTRAINT valid_funds_status 
  CHECK (funds_status IN ('held', 'released', 'auto_released', 'disputed', 'refunded'));

-- Index for finding purchases ready for auto-release
CREATE INDEX IF NOT EXISTS purchases_funds_release_idx 
  ON purchases(funds_release_at, funds_status) 
  WHERE funds_status = 'held';

-- ============================================================
-- Seller Payouts History Table
-- ============================================================

CREATE TABLE IF NOT EXISTS seller_payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- References
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  
  -- Stripe transfer details
  stripe_transfer_id TEXT,
  stripe_account_id TEXT NOT NULL,
  
  -- Amounts
  gross_amount DECIMAL(10, 2) NOT NULL,
  platform_fee DECIMAL(10, 2) NOT NULL,
  net_amount DECIMAL(10, 2) NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending',
  failure_reason TEXT,
  
  -- Timestamps
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS seller_payouts_seller_idx ON seller_payouts(seller_id);
CREATE INDEX IF NOT EXISTS seller_payouts_purchase_idx ON seller_payouts(purchase_id);
CREATE INDEX IF NOT EXISTS seller_payouts_status_idx ON seller_payouts(status);

-- Status constraint
ALTER TABLE seller_payouts ADD CONSTRAINT valid_payout_status 
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- RLS
ALTER TABLE seller_payouts ENABLE ROW LEVEL SECURITY;

-- Sellers can view their own payouts
CREATE POLICY "Sellers can view their payouts"
  ON seller_payouts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON COLUMN users.stripe_account_id IS 'Stripe Connect Express account ID for receiving payouts';
COMMENT ON COLUMN users.stripe_account_status IS 'Current status of Stripe Connect account';
COMMENT ON COLUMN users.stripe_payouts_enabled IS 'Whether payouts are enabled for this seller';
COMMENT ON COLUMN purchases.funds_status IS 'Escrow status: held, released, auto_released, disputed, refunded';
COMMENT ON COLUMN purchases.funds_release_at IS 'Timestamp when funds auto-release (7 days after purchase)';
COMMENT ON COLUMN purchases.buyer_confirmed_at IS 'When buyer confirmed receipt of item';
COMMENT ON TABLE seller_payouts IS 'History of payouts made to sellers via Stripe Connect';

