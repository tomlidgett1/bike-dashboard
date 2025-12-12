-- ============================================================
-- Add Stripe Payment Fields to Purchases Table
-- ============================================================
-- Extends the purchases table to support Stripe payment tracking
-- and platform fee calculation for Yellow Jersey marketplace

-- Add Stripe-specific fields
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Add fee tracking fields
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10, 2);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS seller_payout_amount DECIMAL(10, 2);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending';

-- Add constraint for payout_status
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS valid_payout_status;
ALTER TABLE purchases ADD CONSTRAINT valid_payout_status 
  CHECK (payout_status IN ('pending', 'processing', 'completed', 'failed'));

-- Create index for webhook lookups (finding purchase by Stripe session ID)
CREATE INDEX IF NOT EXISTS purchases_stripe_session_idx ON purchases(stripe_session_id);
CREATE INDEX IF NOT EXISTS purchases_stripe_payment_intent_idx ON purchases(stripe_payment_intent_id);

-- Create index for payout reconciliation
CREATE INDEX IF NOT EXISTS purchases_payout_status_idx ON purchases(payout_status) WHERE payout_status = 'pending';

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON COLUMN purchases.stripe_session_id IS 'Stripe Checkout Session ID for payment tracking';
COMMENT ON COLUMN purchases.stripe_payment_intent_id IS 'Stripe Payment Intent ID for refunds and disputes';
COMMENT ON COLUMN purchases.platform_fee IS 'Yellow Jersey 3% platform fee amount';
COMMENT ON COLUMN purchases.seller_payout_amount IS 'Amount to be paid out to seller (total - platform_fee)';
COMMENT ON COLUMN purchases.payout_status IS 'Status of seller payout: pending, processing, completed, failed';
