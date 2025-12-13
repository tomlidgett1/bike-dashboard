# 🔧 APPLY THIS FIX NOW - Storage RLS Error

## The Problem
You're getting: `StorageApiError: new row violates row-level security policy`

This means the storage bucket policies aren't set up correctly.

## The Solution (3 Steps - 5 Minutes)

### Step 1: Open Supabase SQL Editor

1. Go to: **https://supabase.com/dashboard**
2. Select your project: **lvsxdoyptioyxuwvvpgb**
3. Click **SQL Editor** in the left sidebar (looks like `</>`)
4. Click **New Query** button

### Step 2: Copy & Run This SQL

Copy this ENTIRE block and paste it into the SQL Editor:

```sql
-- Add logo_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;

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

-- Remove ALL old policies
DROP POLICY IF EXISTS "logo_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "logo_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "logo_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "logo_delete_policy" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;

-- Create NEW working policies
CREATE POLICY "logo_insert_policy"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);

CREATE POLICY "logo_select_policy"
ON storage.objects FOR SELECT TO authenticated, anon
USING (bucket_id = 'logo');

CREATE POLICY "logo_update_policy"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
)
WITH CHECK (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);

CREATE POLICY "logo_delete_policy"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'logo' AND
  (SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%')
);
```

Click **RUN** (or press `Cmd/Ctrl + Enter`)

### Step 3: Verify It Worked

Run this verification query:

```sql
SELECT 
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects' 
  AND policyname LIKE 'logo_%'
ORDER BY cmd;
```

**Expected Output:** You should see 4 policies:
- `logo_delete_policy` (DELETE)
- `logo_insert_policy` (INSERT)
- `logo_select_policy` (SELECT)
- `logo_update_policy` (UPDATE)

### Step 4: Test Upload

1. Go to your app: **http://localhost:3000/settings**
2. Scroll to "Business Logo" section
3. Click "Choose Image"
4. Select a small image (under 5MB)
5. Click "Save Changes"

✅ **It should work now!**

---

## Still Getting the Error?

### Debug Checklist:

1. **Are you logged in?**
   - Sign out and sign back in
   - Check browser console: `localStorage.getItem('sb-lvsxdoyptioyxuwvvpgb-auth-token')`

2. **Check the bucket exists:**
   - Go to **Storage** in Supabase Dashboard
   - You should see a bucket named `logo`
   - It should be marked as **Public**

3. **Check browser console for details:**
   - Open DevTools (F12)
   - Go to Console tab
   - Try uploading again
   - Look for the full error message

4. **Verify auth token:**
   Add this to your upload function temporarily:
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   console.log('Auth check:', {
     hasSession: !!session,
     userId: session?.user?.id,
     expiresAt: session?.expires_at
   });
   ```

### Alternative: Disable RLS Temporarily (NOT RECOMMENDED FOR PRODUCTION)

If you just want to test and nothing else works:

```sql
-- ONLY FOR TESTING - DO NOT USE IN PRODUCTION
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
```

But you MUST re-enable it and fix the policies properly:

```sql
-- Re-enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Then run the policies from Step 2 again
```

---

## What Changed?

The new policies use `SPLIT_PART` instead of `storage.foldername()` which is more reliable:

**Old (didn't work):**
```sql
(storage.foldername(name))[1] = auth.uid()::text
```

**New (works):**
```sql
SPLIT_PART(name, '/', 1) = auth.uid()::text OR name LIKE auth.uid()::text || '/%'
```

This checks if the file path starts with the user's ID, allowing uploads to `{user_id}/{filename}`.

---

## Need More Help?

1. Check `TROUBLESHOOTING_LOGO_UPLOAD.md` for detailed debugging
2. Check Supabase logs: Dashboard → Logs → Storage
3. Post in Supabase Discord: https://discord.supabase.com

---

## Quick Reference

**Your Supabase Project:** lvsxdoyptioyxuwvvpgb  
**Bucket Name:** logo  
**Upload Path Format:** `{user_id}/{timestamp}.{ext}`  
**Example:** `123e4567-e89b-12d3-a456-426614174000/1701234567890.png`












