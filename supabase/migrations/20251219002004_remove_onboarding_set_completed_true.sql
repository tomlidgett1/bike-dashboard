-- ============================================================
-- Remove Onboarding Flow - Set onboarding_completed = true by default
-- ============================================================
-- This migration:
-- 1. Updates the handle_new_user() trigger to set onboarding_completed = true for new users
-- 2. Backfills existing users to set onboarding_completed = true

-- Update the trigger function to set onboarding_completed = true for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a new row into public.users for the new auth user
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
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    -- Try to get name from user metadata (Google/Apple often provide this)
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    -- Try to get first name from metadata
    COALESCE(
      NEW.raw_user_meta_data->>'given_name',
      SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 1),
      ''
    ),
    -- Try to get last name from metadata
    COALESCE(
      NEW.raw_user_meta_data->>'family_name',
      NULLIF(SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 2), ''),
      ''
    ),
    '',  -- phone
    '',  -- business_name
    '',  -- store_type
    '',  -- address
    '',  -- website
    'individual',  -- account_type (default to individual for OAuth users)
    false,  -- bicycle_store
    '{}',  -- preferences
    true,  -- onboarding_completed (set to true - no onboarding needed)
    true,   -- email_notifications
    true,   -- order_alerts
    true,   -- inventory_alerts
    false,  -- marketing_emails
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;  -- If profile already exists, don't error

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: Update all existing users to have onboarding_completed = true
UPDATE public.users 
SET onboarding_completed = true 
WHERE onboarding_completed = false OR onboarding_completed IS NULL;

-- Update the default value for the column
ALTER TABLE public.users ALTER COLUMN onboarding_completed SET DEFAULT true;

