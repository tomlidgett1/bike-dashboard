-- ============================================================
-- AUTO-CREATE USER PROFILE ON AUTH SIGNUP
-- ============================================================
-- Creates a minimal users row when an auth.users row is inserted.
-- This ensures:
--   1. Welcome email fires within 1 minute of signup
--   2. Every auth user has a corresponding profile row
--
-- The existing welcome trigger on public.users INSERT still fires
-- correctly — this just moves the moment of creation earlier.
-- profile-provider.tsx saveProfile() will UPDATE (not INSERT) on
-- first profile save, which works fine since the row already exists.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    user_id,
    email,
    name,
    business_name,
    phone,
    store_type,
    address,
    website
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    '',
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

DO $$
BEGIN
  RAISE NOTICE '✅ Auth user → profile auto-creation trigger installed';
END $$;
