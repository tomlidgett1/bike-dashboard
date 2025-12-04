-- Create a trigger function that automatically creates a user profile when a new auth user is created
-- This ensures OAuth users (Google, Apple) get their profile created automatically

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
    false,  -- onboarding_completed
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

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT ON public.users TO supabase_auth_admin;
GRANT SELECT ON public.users TO supabase_auth_admin;

