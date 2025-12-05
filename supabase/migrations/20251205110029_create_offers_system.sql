-- ============================================================
-- OFFERS SYSTEM
-- ============================================================
-- Creates tables and functions for product offer management

-- ============================================================
-- 1. OFFERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Core References
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Pricing
  original_price DECIMAL(10, 2) NOT NULL,
  offer_amount DECIMAL(10, 2) NOT NULL CHECK (offer_amount > 0),
  offer_percentage DECIMAL(5, 2), -- Percentage off (e.g., 10.00 for 10%)
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'rejected', 'countered', 'expired', 'cancelled')
  ),
  
  -- Communication
  message TEXT, -- Buyer's message with the offer
  
  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT buyer_not_seller CHECK (buyer_id != seller_id),
  CONSTRAINT valid_offer_amount CHECK (offer_amount < original_price)
);

-- ============================================================
-- 2. OFFER HISTORY TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS offer_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  
  -- Action Details
  action_type TEXT NOT NULL CHECK (
    action_type IN ('created', 'countered', 'accepted', 'rejected', 'cancelled', 'expired')
  ),
  offered_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Pricing History
  previous_amount DECIMAL(10, 2),
  new_amount DECIMAL(10, 2),
  
  -- Communication
  message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

-- Offers indexes
CREATE INDEX IF NOT EXISTS idx_offers_product_id ON offers(product_id);
CREATE INDEX IF NOT EXISTS idx_offers_buyer_id ON offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_offers_seller_id ON offers(seller_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_expires_at ON offers(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_offers_buyer_status ON offers(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_seller_status ON offers(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_product_status ON offers(product_id, status);

-- Offer history indexes
CREATE INDEX IF NOT EXISTS idx_offer_history_offer_id ON offer_history(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_history_created_at ON offer_history(created_at DESC);

-- ============================================================
-- 4. TRIGGER: Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION update_offers_updated_at();

-- ============================================================
-- 5. TRIGGER: Create history entry on offer creation
-- ============================================================

CREATE OR REPLACE FUNCTION create_offer_history_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO offer_history (
    offer_id,
    action_type,
    offered_by_id,
    new_amount,
    message
  ) VALUES (
    NEW.id,
    'created',
    NEW.buyer_id,
    NEW.offer_amount,
    NEW.message
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_offer_history
  AFTER INSERT ON offers
  FOR EACH ROW
  EXECUTE FUNCTION create_offer_history_on_insert();

-- ============================================================
-- 6. TRIGGER: Create history entry on status change
-- ============================================================

CREATE OR REPLACE FUNCTION create_offer_history_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create history if status changed
  IF OLD.status != NEW.status THEN
    INSERT INTO offer_history (
      offer_id,
      action_type,
      offered_by_id,
      previous_amount,
      new_amount,
      message
    ) VALUES (
      NEW.id,
      NEW.status, -- action_type matches status
      CASE 
        WHEN NEW.status = 'cancelled' THEN NEW.buyer_id
        ELSE NEW.seller_id
      END,
      OLD.offer_amount,
      NEW.offer_amount,
      NULL -- Message added separately if needed
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_offer_status_history
  AFTER UPDATE ON offers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION create_offer_history_on_status_change();

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_history ENABLE ROW LEVEL SECURITY;

-- Offers policies
CREATE POLICY "Buyers can view their own offers"
  ON offers FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Sellers can view offers on their products"
  ON offers FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY "Buyers can create offers"
  ON offers FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Buyers can cancel their pending offers"
  ON offers FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid() AND status = 'pending')
  WITH CHECK (buyer_id = auth.uid() AND status IN ('cancelled', 'pending'));

CREATE POLICY "Sellers can update offers on their products"
  ON offers FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- Offer history policies
CREATE POLICY "Users can view history of their offers"
  ON offer_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_history.offer_id
      AND (offers.buyer_id = auth.uid() OR offers.seller_id = auth.uid())
    )
  );

CREATE POLICY "System can insert offer history"
  ON offer_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 8. HELPER FUNCTION: Get active offer count for product
-- ============================================================

CREATE OR REPLACE FUNCTION get_active_offer_count(p_product_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM offers
    WHERE product_id = p_product_id
    AND status IN ('pending', 'countered')
    AND expires_at > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. HELPER FUNCTION: Get highest offer for product
-- ============================================================

CREATE OR REPLACE FUNCTION get_highest_offer(p_product_id UUID)
RETURNS DECIMAL(10, 2) AS $$
BEGIN
  RETURN (
    SELECT MAX(offer_amount)
    FROM offers
    WHERE product_id = p_product_id
    AND status IN ('pending', 'countered')
    AND expires_at > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. COMMENTS
-- ============================================================

COMMENT ON TABLE offers IS 'Stores product offers made by buyers to sellers';
COMMENT ON TABLE offer_history IS 'Tracks complete history of offer negotiations';
COMMENT ON COLUMN offers.offer_percentage IS 'Percentage off original price (e.g., 10.00 = 10% off)';
COMMENT ON COLUMN offers.status IS 'pending: awaiting seller response, accepted: seller accepted, rejected: seller rejected, countered: seller made counter-offer, expired: offer expired, cancelled: buyer cancelled';
COMMENT ON COLUMN offer_history.action_type IS 'Type of action: created, countered, accepted, rejected, cancelled, expired';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Offers system tables created successfully';
  RAISE NOTICE '📊 Tables: offers, offer_history';
  RAISE NOTICE '🔒 RLS policies enabled';
  RAISE NOTICE '⚡ Triggers and indexes created';
END $$;

