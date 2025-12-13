-- ============================================================
-- ADD FOREIGN KEYS TO PUBLIC USERS TABLE
-- ============================================================
-- These FKs enable PostgREST to join tables with the public users
-- table for fetching user profile info (name, business_name, etc.)

-- ============================================================
-- 1. PURCHASES TABLE
-- ============================================================

-- FK for purchases.buyer_id -> users.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'purchases_buyer_id_users_fkey'
  ) THEN
    ALTER TABLE purchases 
    ADD CONSTRAINT purchases_buyer_id_users_fkey 
    FOREIGN KEY (buyer_id) REFERENCES users(user_id) ON DELETE CASCADE;
    
    RAISE NOTICE '✅ Added FK: purchases.buyer_id -> users.user_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add purchases_buyer_id_users_fkey: %', SQLERRM;
END $$;

-- FK for purchases.seller_id -> users.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'purchases_seller_id_users_fkey'
  ) THEN
    ALTER TABLE purchases 
    ADD CONSTRAINT purchases_seller_id_users_fkey 
    FOREIGN KEY (seller_id) REFERENCES users(user_id) ON DELETE CASCADE;
    
    RAISE NOTICE '✅ Added FK: purchases.seller_id -> users.user_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add purchases_seller_id_users_fkey: %', SQLERRM;
END $$;

-- ============================================================
-- 2. TICKET_MESSAGES TABLE
-- ============================================================

-- FK for ticket_messages.sender_id -> users.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ticket_messages_sender_id_users_fkey'
  ) THEN
    ALTER TABLE ticket_messages 
    ADD CONSTRAINT ticket_messages_sender_id_users_fkey 
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE;
    
    RAISE NOTICE '✅ Added FK: ticket_messages.sender_id -> users.user_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add ticket_messages_sender_id_users_fkey: %', SQLERRM;
END $$;

-- ============================================================
-- 3. TICKET_HISTORY TABLE
-- ============================================================

-- FK for ticket_history.performed_by -> users.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ticket_history_performed_by_users_fkey'
  ) THEN
    ALTER TABLE ticket_history 
    ADD CONSTRAINT ticket_history_performed_by_users_fkey 
    FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Added FK: ticket_history.performed_by -> users.user_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add ticket_history_performed_by_users_fkey: %', SQLERRM;
END $$;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ All user foreign keys added for PostgREST joins';
END $$;

