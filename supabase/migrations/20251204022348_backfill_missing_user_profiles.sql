-- Backfill missing user profiles for existing auth users (OAuth users who signed up before the trigger)
-- This is a one-time migration to fix existing users

INSERT INTO public.users (
  user_id,
  email,
  name,
  first_name,
  last_name,
  phone,
  business_name,
  store_type,
  address,
  website,
  account_type,
  bicycle_store,
  preferences,
  onboarding_completed,
  email_notifications,
  order_alerts,
  inventory_alerts,
  marketing_emails,
  created_at,
  updated_at
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
  '',  -- phone
  '',  -- business_name
  '',  -- store_type
  '',  -- address
  '',  -- website
  'individual',  -- account_type
  false,  -- bicycle_store
  '{}',  -- preferences
  false,  -- onboarding_completed
  true,   -- email_notifications
  true,   -- order_alerts
  true,   -- inventory_alerts
  false,  -- marketing_emails
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
);

