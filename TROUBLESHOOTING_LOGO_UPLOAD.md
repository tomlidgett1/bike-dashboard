# Troubleshooting Logo Upload - RLS Error

## Error: "new row violates row-level security policy"

This error occurs when trying to upload a file to Supabase Storage, but the Row Level Security (RLS) policies are not properly configured.

## Quick Fix Options

### Option 1: Run Manual SQL Script (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor**
4. Copy and paste the contents of `MANUAL_STORAGE_SETUP.sql`
5. Click **Run** or press `Cmd/Ctrl + Enter`
6. Verify the output shows the bucket and policies were created

### Option 2: Use Supabase CLI Migration

```bash
# Make sure you're linked to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

### Option 3: Create Bucket via Dashboard (Alternative)

If the SQL approach doesn't work, you can create the bucket manually:

1. Go to **Storage** in your Supabase Dashboard
2. Click **New bucket**
3. Configure:
   - **Name**: `logo`
   - **Public bucket**: ✅ Yes
   - **File size limit**: 5MB
   - **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/gif, image/webp`
4. Click **Create bucket**

Then apply the RLS policies using the SQL Editor:

```sql
-- Drop existing policies
DROP POLICY IF EXISTS "Users can upload own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;

-- Create policies
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

## Verification Steps

After applying the fix, verify the setup:

### 1. Check Bucket Exists

Go to **Storage** in Supabase Dashboard and verify:
- Bucket named `logo` exists
- It's marked as **Public**
- File size limit is set

### 2. Check RLS Policies

Run this query in SQL Editor:

```sql
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%logo%';
```

You should see 4 policies:
- `Users can upload own logo` (INSERT)
- `Users can update own logo` (UPDATE)
- `Users can delete own logo` (DELETE)
- `Anyone can view logos` (SELECT)

### 3. Test Upload

1. Go to your app's Settings page
2. Try uploading a small test image
3. Check browser console for any errors
4. If successful, the logo should appear in the header and sidebar

## Common Issues and Solutions

### Issue 1: Bucket Already Exists

**Error**: `duplicate key value violates unique constraint`

**Solution**: The bucket already exists. Just apply the RLS policies:

```sql
-- Only run the policy creation parts from MANUAL_STORAGE_SETUP.sql
DROP POLICY IF EXISTS "Users can upload own logo" ON storage.objects;
-- ... (rest of the policies)
```

### Issue 2: Permission Denied

**Error**: `permission denied for schema storage`

**Solution**: Make sure you're running the SQL as a superuser. In Supabase Dashboard SQL Editor, you should have the necessary permissions by default.

### Issue 3: Function storage.foldername Does Not Exist

**Error**: `function storage.foldername(text) does not exist`

**Solution**: Update to a simpler policy that doesn't use foldername:

```sql
-- Simpler policy without foldername function
CREATE POLICY "Users can upload own logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logo' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);
```

### Issue 4: Still Getting RLS Error After Setup

**Solution**: Try these steps:

1. **Clear browser cache** and reload the page
2. **Sign out and sign back in** to refresh the auth token
3. **Check the file path** in the upload code matches the policy:
   ```typescript
   const filePath = `${user.id}/${fileName}`;
   ```
4. **Verify user is authenticated**:
   ```typescript
   console.log('User ID:', user?.id);
   console.log('Auth token:', (await supabase.auth.getSession()).data.session?.access_token);
   ```

## Debug Mode

To see exactly what's happening, add debug logging to the upload function:

```typescript
const uploadLogo = async (): Promise<string | null> => {
  if (!logoFile || !user) return null;
  
  try {
    const supabase = createClient();
    
    console.log('🔍 Upload Debug Info:');
    console.log('User ID:', user.id);
    console.log('File:', logoFile.name, logoFile.size, logoFile.type);
    
    const fileExt = logoFile.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;
    
    console.log('Upload path:', filePath);
    
    const { data, error: uploadError } = await supabase.storage
      .from('logo')
      .upload(filePath, logoFile, {
        cacheControl: '3600',
        upsert: false
      });
    
    console.log('Upload result:', { data, error: uploadError });
    
    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      throw uploadError;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('logo')
      .getPublicUrl(filePath);
    
    console.log('✅ Public URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('💥 Upload failed:', error);
    throw error;
  }
};
```

## Still Having Issues?

If none of the above solutions work:

1. **Check Supabase Status**: https://status.supabase.com
2. **Review Supabase Logs**: Dashboard → Logs → Storage
3. **Check Network Tab**: Browser DevTools → Network → Look for failed requests
4. **Verify Environment Variables**: 
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Contact Information

If you're still stuck, check:
- Supabase Documentation: https://supabase.com/docs/guides/storage
- Supabase Discord: https://discord.supabase.com
- GitHub Issues: https://github.com/supabase/supabase/issues










