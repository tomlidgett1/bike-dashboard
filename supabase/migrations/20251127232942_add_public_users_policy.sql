-- ============================================================
-- Add Public Read Access to Users Table for Stores Listing
-- ============================================================

-- Drop existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view own profile" ON users;

-- Create policy for users to view their own profile
CREATE POLICY "Users can view own profile"
  ON users
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy for public to view basic store information
CREATE POLICY "Public can view store listings"
  ON users
  FOR SELECT
  USING (true);

COMMENT ON POLICY "Public can view store listings" ON users IS 'Allows public access to view all stores for marketplace browsing';










