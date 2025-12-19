-- ============================================================
-- Fix RLS Policy for User Profile Creation Trigger
-- ============================================================
-- The handle_new_user() trigger runs when a new auth user is created,
-- but the RLS policy was blocking inserts because auth.uid() isn't set
-- during the signup process.
--
-- This migration adds a policy to allow the supabase_auth_admin role
-- (which runs auth triggers) to insert user profiles.
-- ============================================================

-- Drop existing insert policy that blocks the trigger
DROP POLICY IF EXISTS "Users can insert own profile" ON users;

-- Recreate insert policy for regular users
CREATE POLICY "Users can insert own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add policy to allow auth admin to insert profiles (for the signup trigger)
CREATE POLICY "Auth admin can insert user profiles"
  ON users
  FOR INSERT
  TO supabase_auth_admin
  WITH CHECK (true);

-- Also grant UPDATE permission to supabase_auth_admin (for future use)
GRANT UPDATE ON public.users TO supabase_auth_admin;

-- Ensure the trigger function has proper permissions
-- The SECURITY DEFINER attribute makes the function run as the owner (postgres)
-- which bypasses RLS, but we need explicit grants for the role that invokes it

-- Add comment for documentation
COMMENT ON POLICY "Auth admin can insert user profiles" ON users IS 
  'Allows the supabase_auth_admin role to create user profiles during signup via the handle_new_user() trigger';

