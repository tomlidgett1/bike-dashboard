-- ============================================================
-- ADD OFFER PAYMENT FIELDS
-- ============================================================
-- Adds payment tracking fields to the offers table for Stripe integration

-- ============================================================
-- 1. ADD PAYMENT STATUS COLUMN
-- ============================================================

ALTER TABLE offers 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' 
CHECK (payment_status IN ('pending', 'paid', 'failed'));

COMMENT ON COLUMN offers.payment_status IS 'Payment status for accepted offers: pending (awaiting payment), paid (payment complete), failed (payment failed)';

-- ============================================================
-- 2. ADD STRIPE SESSION ID COLUMN
-- ============================================================

ALTER TABLE offers
ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

COMMENT ON COLUMN offers.stripe_session_id IS 'Stripe Checkout Session ID for tracking payment';

-- ============================================================
-- 3. ADD PAYMENT DEADLINE COLUMN
-- ============================================================

ALTER TABLE offers
ADD COLUMN IF NOT EXISTS payment_deadline TIMESTAMPTZ;

COMMENT ON COLUMN offers.payment_deadline IS 'Deadline for buyer to complete payment after offer is accepted (48 hours from acceptance)';

-- ============================================================
-- 4. ADD PURCHASE ID REFERENCE
-- ============================================================

ALTER TABLE offers
ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL;

COMMENT ON COLUMN offers.purchase_id IS 'Reference to the purchase record created after payment';

-- ============================================================
-- 5. ADD INDEX FOR PAYMENT STATUS QUERIES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_offers_payment_status ON offers(payment_status) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_offers_payment_deadline ON offers(payment_deadline) WHERE status = 'accepted' AND payment_status = 'pending';

-- ============================================================
-- 6. UPDATE RLS POLICIES FOR SERVICE ROLE ACCESS
-- ============================================================

-- Allow service role to update payment fields (for webhook processing)
CREATE POLICY "Service role can update payment status"
  ON offers FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 7. ADD OFFER_ID TO PURCHASES TABLE
-- ============================================================

-- Add offer_id column to purchases to track which purchase came from an offer
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

-- Add original_price column to purchases for offer discount tracking
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2);

CREATE INDEX IF NOT EXISTS idx_purchases_offer_id ON purchases(offer_id) WHERE offer_id IS NOT NULL;

COMMENT ON COLUMN purchases.offer_id IS 'Reference to the offer that led to this purchase (if applicable)';
COMMENT ON COLUMN purchases.original_price IS 'Original price before any offer discount';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Offer payment fields added successfully';
  RAISE NOTICE '📊 Offers columns: payment_status, stripe_session_id, payment_deadline, purchase_id';
  RAISE NOTICE '📊 Purchases columns: offer_id, original_price';
  RAISE NOTICE '🔒 RLS policies updated';
END $$;
