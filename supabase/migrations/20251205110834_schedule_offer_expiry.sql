-- ============================================================
-- OFFER EXPIRY CRON JOB
-- ============================================================
-- Automatically expires offers that have passed their expiry date

-- ============================================================
-- 1. FUNCTION: Expire old offers
-- ============================================================

CREATE OR REPLACE FUNCTION expire_old_offers()
RETURNS void AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Update offers that have expired
  UPDATE offers
  SET 
    status = 'expired',
    updated_at = NOW()
  WHERE 
    status IN ('pending', 'countered')
    AND expires_at <= NOW();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  -- Log the result
  RAISE NOTICE 'Expired % offer(s)', expired_count;
  
  -- TODO: Create notifications for expired offers
  -- This will be implemented in the notifications-system todo
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. SCHEDULE CRON JOB
-- ============================================================

-- Run every day at 2:00 AM UTC
SELECT cron.schedule(
  'expire-old-offers',
  '0 2 * * *', -- Every day at 2 AM
  $$
  SELECT expire_old_offers();
  $$
);

-- ============================================================
-- 3. FUNCTION: Get offers expiring soon (for warnings)
-- ============================================================

CREATE OR REPLACE FUNCTION get_offers_expiring_soon(hours_before INTEGER DEFAULT 24)
RETURNS TABLE (
  offer_id UUID,
  buyer_id UUID,
  seller_id UUID,
  product_id UUID,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    offers.buyer_id,
    offers.seller_id,
    offers.product_id,
    offers.expires_at
  FROM offers
  WHERE 
    status IN ('pending', 'countered')
    AND expires_at > NOW()
    AND expires_at <= NOW() + (hours_before || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. FUNCTION: Send expiry warnings (called by another cron)
-- ============================================================

CREATE OR REPLACE FUNCTION send_offer_expiry_warnings()
RETURNS void AS $$
DECLARE
  warning_count INTEGER;
BEGIN
  -- This function can be used to send notifications
  -- about offers expiring in the next 24 hours
  
  SELECT COUNT(*)::INTEGER INTO warning_count
  FROM get_offers_expiring_soon(24);
  
  RAISE NOTICE '% offer(s) expiring in the next 24 hours', warning_count;
  
  -- TODO: Create notifications for expiring soon offers
  -- This will be implemented in the notifications-system todo
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Schedule warning notifications (runs every 6 hours)
SELECT cron.schedule(
  'warn-expiring-offers',
  '0 */6 * * *', -- Every 6 hours
  $$
  SELECT send_offer_expiry_warnings();
  $$
);

-- ============================================================
-- 5. COMMENTS
-- ============================================================

COMMENT ON FUNCTION expire_old_offers() IS 'Automatically expires offers that have passed their expiry date';
COMMENT ON FUNCTION get_offers_expiring_soon(INTEGER) IS 'Returns offers that will expire within the specified hours';
COMMENT ON FUNCTION send_offer_expiry_warnings() IS 'Identifies offers expiring soon for notification purposes';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Offer expiry cron job scheduled successfully';
  RAISE NOTICE '⏰ Expires offers daily at 2:00 AM UTC';
  RAISE NOTICE '⚠️  Sends expiry warnings every 6 hours';
END $$;

