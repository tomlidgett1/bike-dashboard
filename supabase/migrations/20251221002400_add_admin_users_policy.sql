-- ============================================================
-- Add Admin Policy for Users Table
-- ============================================================
-- Allows admin users to view all user profiles for admin features
-- like scheduled uploads user selection

-- Admin users can view all user profiles
CREATE POLICY "Admin users can view all profiles"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'tom@lidgett.net'
    )
  );

-- Add comment
COMMENT ON POLICY "Admin users can view all profiles" ON users 
  IS 'Allows admin user (tom@lidgett.net) to view all user profiles for admin features';

