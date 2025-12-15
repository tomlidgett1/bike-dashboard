-- ============================================================
-- FIX: Allow buyers to accept/reject counter-offers
-- ============================================================
-- The current RLS policy only allows buyers to update pending offers,
-- but buyers also need to accept/reject counter-offers (status = 'countered')

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Buyers can cancel their pending offers" ON offers;

-- Create new policy that allows buyers to:
-- 1. Cancel their pending offers
-- 2. Accept counter-offers (change countered → accepted)
-- 3. Reject counter-offers (change countered → rejected)
CREATE POLICY "Buyers can manage their offers"
  ON offers FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid() AND status IN ('pending', 'countered'))
  WITH CHECK (
    buyer_id = auth.uid() AND 
    (
      -- Can cancel pending offers
      (status = 'cancelled') OR
      -- Can accept counter-offers
      (status = 'accepted') OR
      -- Can reject counter-offers  
      (status = 'rejected') OR
      -- Can keep as pending (for other field updates)
      (status = 'pending') OR
      -- Can keep as countered (for payment field updates after acceptance flow)
      (status = 'countered')
    )
  );

-- ============================================================
-- Notify
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed buyer RLS policy for accepting counter-offers';
END $$;
