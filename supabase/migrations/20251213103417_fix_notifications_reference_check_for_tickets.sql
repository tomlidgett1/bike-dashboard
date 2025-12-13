-- ============================================================
-- FIX: Include ticket_id in notifications reference check
-- ============================================================
-- The notifications_reference_check constraint only allowed 
-- conversation_id OR offer_id, but ticket notifications 
-- need ticket_id as a valid reference.

DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;
  
  -- Updated check: at least one reference must exist
  -- - Message notifications: conversation_id
  -- - Offer notifications: offer_id
  -- - Support ticket notifications: ticket_id
  ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check CHECK (
    conversation_id IS NOT NULL 
    OR offer_id IS NOT NULL 
    OR ticket_id IS NOT NULL
  );
  
  RAISE NOTICE '✅ Updated notifications_reference_check to include ticket_id';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update reference check constraint: %', SQLERRM;
END $$;

-- ============================================================
-- ADD FK from support_tickets to public.users table
-- ============================================================
-- This enables PostgREST to join support_tickets with the 
-- public users table to get creator info

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'support_tickets_created_by_users_fkey'
  ) THEN
    ALTER TABLE support_tickets 
    ADD CONSTRAINT support_tickets_created_by_users_fkey 
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE;
    
    RAISE NOTICE '✅ Added FK from support_tickets.created_by to users.user_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add users FK: %', SQLERRM;
END $$;

-- Also add FK for assigned_to if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'support_tickets_assigned_to_users_fkey'
  ) THEN
    ALTER TABLE support_tickets 
    ADD CONSTRAINT support_tickets_assigned_to_users_fkey 
    FOREIGN KEY (assigned_to) REFERENCES users(user_id) ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Added FK from support_tickets.assigned_to to users.user_id';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add assigned_to FK: %', SQLERRM;
END $$;

