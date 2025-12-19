-- ============================================================
-- Backfill Missing User Profiles (December 19, 2024)
-- ============================================================
-- This ensures all auth.users have a corresponding public.users record
-- This is needed for the products.user_id foreign key constraint

INSERT INTO public.users (
  user_id,
  email,
  name,
  first_name,
  last_name,
  onboarding_completed
)
SELECT 
  au.id,
  COALESCE(au.email, ''),
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    ''
  ),
  COALESCE(
    au.raw_user_meta_data->>'given_name',
    SPLIT_PART(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''), ' ', 1),
    ''
  ),
  COALESCE(
    au.raw_user_meta_data->>'family_name',
    NULLIF(SPLIT_PART(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''), ' ', 2), ''),
    ''
  ),
  true  -- Skip onboarding for existing users
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
);

