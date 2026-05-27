-- Populate logo_url from Google OAuth metadata when creating public.users row.
-- Google supplies avatar_url and/or picture in raw_user_meta_data.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logo_url TEXT;
BEGIN
  v_logo_url := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    ''
  )), '');

  INSERT INTO public.users (
    user_id,
    email,
    name,
    first_name,
    last_name,
    logo_url
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
    ),
    v_logo_url
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error for user %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates public.users on auth signup; sets logo_url from Google avatar_url/picture when present.';
