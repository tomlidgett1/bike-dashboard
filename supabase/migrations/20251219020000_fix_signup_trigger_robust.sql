-- ============================================================
-- Robust Signup Trigger Fix
-- ============================================================
-- This migration recreates the handle_new_user() trigger with:
-- 1. Better error handling - catches exceptions and logs them
-- 2. Simpler insert - only essential fields, let defaults handle the rest
-- 3. Proper permissions bypass
-- ============================================================

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the old function
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved trigger function with error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert a minimal profile - let column defaults handle most fields
  INSERT INTO public.users (
    user_id,
    email,
    name,
    first_name,
    last_name
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'given_name',
      SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'family_name',
      NULLIF(SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 2), '')
    )
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'handle_new_user error for user %: % %', NEW.id, SQLERRM, SQLSTATE;
    -- Still return NEW to allow the auth signup to succeed
    -- The user profile can be created later
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure proper permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.users TO supabase_auth_admin;

-- Also add a service role bypass for the RLS
DROP POLICY IF EXISTS "Service role bypass" ON users;
CREATE POLICY "Service role bypass"
  ON users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON FUNCTION public.handle_new_user() IS 
  'Creates a user profile in public.users when a new auth user signs up. Has error handling to prevent signup failures.';

