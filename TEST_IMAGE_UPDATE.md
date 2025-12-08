# 🔍 Test Image Update System

## Test the complete flow

### Step 1: Open Admin Page with Console
```
http://localhost:3000/admin/image-qa
```

Press F12 to open developer console

### Step 2: Click an Image
Click on any image to approve/reject it.

**Watch the console for:**
```
[CLICK] Image <id> current status: pending
[CLICK] Changing to: approved
[CLICK] Sending update to database...
[CLICK] Image ID: <uuid>
[CLICK] New status: approved
[CLICK] Database response: { data: [...], error: null }
[CLICK] ✅ Successfully updated image <uuid> to approved
[CLICK] Updated data: { id, approval_status: 'approved', ... }
```

### Step 3: Check What Went Wrong

**If you see errors in console:**
- `error: { ... }` → There's a database permission issue
- `No data returned` → Update failed silently
- Exception → JavaScript error

**Common Issues:**

1. **RLS Policy Issue**
   - Error message will contain "policy" or "permission"
   - Solution: Run the SQL below to check policies

2. **Invalid Image ID**
   - Error: "Image not found"
   - The image ID might be incorrect

3. **Network Error**
   - Error: "Failed to fetch"
   - Check if dev server is running

### Step 4: Verify in Database

Run this in Supabase SQL Editor:
```sql
-- Check recent image updates
SELECT 
  id,
  canonical_product_id,
  approval_status,
  created_at,
  updated_at
FROM product_images
ORDER BY updated_at DESC
LIMIT 10;
```

Look for:
- `updated_at` should be recent (within last few minutes)
- `approval_status` should match what you clicked

### Step 5: Check Marketplace Display

1. Go to marketplace: `http://localhost:3000/marketplace`
2. Find the product you just approved images for
3. Click on the product to view details
4. **Only APPROVED images should show**

**Expected behavior:**
- Approved images (green border in admin) → Show on marketplace
- Pending images (gray border in admin) → Don't show on marketplace  
- Rejected images (red border in admin) → Don't show on marketplace

### Step 6: Run SQL Check

```sql
-- Check RLS policies on product_images
SELECT 
  policyname,
  cmd,
  roles,
  qual as "using_clause",
  with_check
FROM pg_policies 
WHERE tablename = 'product_images'
ORDER BY cmd, policyname;

-- Should see:
-- "Users can update product images" with cmd='UPDATE' and roles='{authenticated}'
```

### Step 7: Manual Test Update

Replace `<IMAGE_ID>` with actual ID from admin page console:

```sql
-- Try manual update as authenticated user
UPDATE product_images 
SET approval_status = 'approved'
WHERE id = '<IMAGE_ID>';

-- Check if it worked
SELECT id, approval_status, updated_at
FROM product_images
WHERE id = '<IMAGE_ID>';
```

If this works but UI doesn't → Frontend issue
If this fails → RLS policy issue

## What I Fixed

1. ✅ Added detailed console logging to track every step
2. ✅ Added `.select()` to see what data was returned
3. ✅ Added error alerts to show failures
4. ✅ Filter marketplace to only show `approval_status='approved'` images
5. ✅ Existing RLS policy allows authenticated users to UPDATE

## Next Steps

1. Click an image in admin panel
2. Check console output - copy and paste what you see
3. If there's an error, tell me the exact error message
4. This will tell us exactly what's failing!





