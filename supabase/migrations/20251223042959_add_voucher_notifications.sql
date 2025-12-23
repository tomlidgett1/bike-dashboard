-- ============================================================
-- VOUCHER NOTIFICATIONS
-- ============================================================
-- Adds notification support for voucher awards

-- ============================================================
-- 1. ADD VOUCHER_ID COLUMN TO NOTIFICATIONS
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS voucher_id UUID;

-- Add foreign key constraint for voucher_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_voucher_id_fkey'
  ) THEN
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_voucher_id_fkey 
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for quick lookup by voucher_id
CREATE INDEX IF NOT EXISTS idx_notifications_voucher_id ON notifications(voucher_id);

-- ============================================================
-- 2. UPDATE TYPE CONSTRAINT FOR VOUCHER NOTIFICATIONS
-- ============================================================

DO $$
BEGIN
  -- Drop existing type constraint
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  -- Add new type constraint including voucher_received
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'new_message', 'new_conversation',
      'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired',
      'purchase_complete', 'listing_sold',
      'order_placed', 'order_confirmed', 'order_shipped', 'order_delivered', 'order_cancelled',
      'ticket_created', 'ticket_reply', 'ticket_resolved',
      'voucher_received'
    )
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update type constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 3. UPDATE NOTIFICATION CATEGORY CONSTRAINT
-- ============================================================

DO $$
BEGIN
  -- Drop existing category constraint
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
  
  -- Add new category constraint including voucher
  ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
    notification_category IN ('message', 'offer', 'order', 'ticket', 'voucher')
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update category constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 4. UPDATE REFERENCE CHECK CONSTRAINT
-- ============================================================

DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;
  
  -- Updated check: at least one reference must exist
  ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check CHECK (
    conversation_id IS NOT NULL 
    OR offer_id IS NOT NULL 
    OR ticket_id IS NOT NULL
    OR purchase_id IS NOT NULL
    OR voucher_id IS NOT NULL
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update reference check constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 5. UPDATE TRIGGER FUNCTION TO CREATE NOTIFICATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_first_upload_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_voucher_id UUID;
  v_voucher_code TEXT;
  v_listing_count INT;
BEGIN
  -- Count existing active/sold products for this user
  SELECT COUNT(*)
  INTO v_listing_count
  FROM products
  WHERE user_id = NEW.user_id
    AND status IN ('active', 'sold');

  -- Only award if this is their FIRST product
  IF v_listing_count = 1 THEN
    -- Check if they already have a first_upload voucher
    SELECT COUNT(*) INTO v_listing_count
    FROM vouchers
    WHERE user_id = NEW.user_id
      AND voucher_type = 'first_upload';

    -- Only create if they don't have one
    IF v_listing_count = 0 THEN
      -- Generate unique voucher code
      v_voucher_code := 'YJ-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NEW.user_id::TEXT) FOR 8));

      -- Create the voucher
      INSERT INTO vouchers (
        user_id,
        code,
        voucher_type,
        amount_cents,
        min_purchase_cents,
        max_discount_cents,
        description,
        status,
        valid_from,
        valid_until
      ) VALUES (
        NEW.user_id,
        v_voucher_code,
        'first_upload',
        1000, -- $10.00
        3000, -- $30.00 minimum
        1000, -- $10.00 max discount
        'Congratulations on your first listing! Enjoy $10 off your next purchase over $30.',
        'active',
        NOW(),
        NOW() + INTERVAL '90 days' -- Valid for 90 days
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

      RAISE LOG 'First upload voucher created with notification: user_id=%, voucher_id=%, code=%', 
        NEW.user_id, v_voucher_id, v_voucher_code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_first_upload_voucher() IS 'Awards a $10 voucher to users on their first product upload and creates a notification';

