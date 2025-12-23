-- ============================================================
-- FIX: Voucher Notification Function
-- ============================================================
-- Fixes the create_first_upload_voucher function to use correct column names

CREATE OR REPLACE FUNCTION public.create_first_upload_voucher()
RETURNS TRIGGER AS $$
DECLARE
  existing_voucher_count INTEGER;
  existing_product_count INTEGER;
  v_voucher_id UUID;
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
    )
    RETURNING id INTO v_voucher_id;

    -- Create a notification for the user
    INSERT INTO notifications (
      user_id,
      voucher_id,
      type,
      notification_category,
      priority,
      is_read,
      email_delivery_status,
      created_at
    ) VALUES (
      NEW.user_id,
      v_voucher_id,
      'voucher_received',
      'voucher',
      'normal',
      false,
      'pending',
      NOW()
    );
    
    RAISE NOTICE 'Created first_upload voucher with notification for user %', NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_first_upload_voucher() IS 'Awards a $10 voucher to users on their first product upload and creates a notification';

