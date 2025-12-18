# Quick Fix: RLS Error for Logo Upload

## The Error
```
StorageApiError: new row violates row-level security policy
```

## The Solution (2 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar

### Step 2: Run This SQL

Copy and paste this entire block and click **Run**:

```sql
-- Create or update logo bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logo', 
  'logo', 
  true, 
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

-- Remove old policies
DROP POLICY IF EXISTS "Users can upload own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;

-- Create new policies
CREATE POLICY "Users can upload own logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logo' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own logo"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'logo' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'logo' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own logo"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logo' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'logo');
```

### Step 3: Verify
Run this to check it worked:

```sql
SELECT 
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'objects' 
  AND policyname LIKE '%logo%';
```

You should see 4 policies listed.

### Step 4: Test
1. Go to your app's Settings page
2. Upload a logo
3. It should work! ✅

## Still Not Working?

### Quick Checks:
- [ ] Signed in to the app?
- [ ] Using a valid image file (JPG, PNG, GIF)?
- [ ] File size under 5MB?
- [ ] Browser console shows any other errors?

### Alternative: If `storage.foldername` function doesn't exist

Replace the policies with this simpler version:

```sql
DROP POLICY IF EXISTS "Users can upload own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;

CREATE POLICY "Users can upload own logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logo' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

CREATE POLICY "Users can update own logo"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'logo' AND auth.uid()::text = (string_to_array(name, '/'))[1])
WITH CHECK (bucket_id = 'logo' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

CREATE POLICY "Users can delete own logo"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logo' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'logo');
```

## Need More Help?

See `TROUBLESHOOTING_LOGO_UPLOAD.md` for detailed troubleshooting steps.















