-- ============================================================
-- Fix Scheduled Listings RLS Policies
-- ============================================================
-- Simplify RLS to allow authenticated access, enforce admin in API
-- This matches the pattern used in instagram_posts table

-- Drop the complex email-checking policies
DROP POLICY IF EXISTS "Admins can view all scheduled listings" ON scheduled_listings;
DROP POLICY IF EXISTS "Admins can insert scheduled listings" ON scheduled_listings;
DROP POLICY IF EXISTS "Admins can update scheduled listings" ON scheduled_listings;
DROP POLICY IF EXISTS "Admins can delete scheduled listings" ON scheduled_listings;

-- Create simpler policies (admin check happens in API layer)
CREATE POLICY "Authenticated users can view scheduled listings"
  ON scheduled_listings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scheduled listings"
  ON scheduled_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update scheduled listings"
  ON scheduled_listings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete scheduled listings"
  ON scheduled_listings
  FOR DELETE
  TO authenticated
  USING (true);

-- Add comments
COMMENT ON POLICY "Authenticated users can view scheduled listings" ON scheduled_listings 
  IS 'RLS allows authenticated access, admin enforcement is in API layer';

