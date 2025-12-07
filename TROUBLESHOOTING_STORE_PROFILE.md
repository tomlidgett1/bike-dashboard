# Troubleshooting: Store Profile "Failed to Load" Error

## Issue
When trying to access a store profile page, you see "Failed to load store profile".

## Root Causes & Solutions

### 1. Database Tables Don't Exist (Most Likely)

The `store_categories` and `store_services` tables need to be created.

**Solution:**
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `SETUP_STORE_TABLES.sql`
4. Click "Run"
5. Verify you see output showing both tables were created

### 2. No Store ID in URL

The store profile page requires a valid store ID (user_id of a verified bicycle store).

**Check:**
- URL should be: `/marketplace/store/[UUID]`
- Example: `/marketplace/store/123e4567-e89b-12d3-a456-426614174000`

**Solution:**
1. Go to Marketplace → Stores view
2. Click on a store card
3. Or click on a store logo/name on any product card

### 3. Store Not Verified

The store must be a verified bicycle store (`account_type = 'bicycle_store' AND bicycle_store = true`).

**Check in Supabase:**
```sql
SELECT user_id, business_name, account_type, bicycle_store 
FROM users 
WHERE account_type = 'bicycle_store';
```

**Solution:**
If a store isn't verified, update it:
```sql
UPDATE users 
SET bicycle_store = true 
WHERE user_id = 'YOUR_STORE_USER_ID';
```

### 4. Check Browser Console

Open browser DevTools (F12) and check:

**Console Tab:**
- Look for error messages
- Check if API call is being made to `/api/marketplace/store/[storeId]`

**Network Tab:**
- Find the API request to `/api/marketplace/store/[storeId]`
- Check the response:
  - Status 404: Store not found or not verified
  - Status 500: Server error (check server logs)
  - Status 200: API working, issue is in frontend

### 5. Server Not Running or Stale Cache

**Solution:**
```bash
cd bike-dashboard
rm -rf .next
npm run dev
```

## Quick Test

### Test 1: Check if tables exist
Run in Supabase SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('store_categories', 'store_services');
```

Should return 2 rows. If not, run `SETUP_STORE_TABLES.sql`.

### Test 2: Test API directly
1. Get a verified store's user_id:
```sql
SELECT user_id, business_name 
FROM users 
WHERE bicycle_store = true 
LIMIT 1;
```

2. Visit in browser:
```
http://localhost:3003/api/marketplace/store/[USER_ID_FROM_STEP_1]
```

Should return JSON with store data.

### Test 3: Check store card navigation
1. Go to `/marketplace?view=stores`
2. Click on any store card
3. Should navigate to `/marketplace/store/[storeId]`

## Common Error Messages

### "Store not found"
- Store ID is invalid
- Store is not verified (bicycle_store = false)
- Store doesn't exist in users table

### "Failed to load store profile"
- Network error (check if server is running)
- API returned error (check browser console)
- Database tables don't exist

### "Internal server error"
- Check server terminal for error logs
- Database connection issue
- Missing environment variables

## Still Not Working?

1. **Check server logs** in the terminal where `npm run dev` is running
2. **Check browser console** (F12 → Console tab)
3. **Verify database tables exist** using Test 1 above
4. **Test API directly** using Test 2 above

## Next Steps After Fix

Once the store profile loads:
1. ✅ Verify logo displays correctly
2. ✅ Test category filtering
3. ✅ Click "Contact" button to test modal
4. ✅ Check if services section displays
5. ✅ Test product carousels (scroll, expand)
6. ✅ Go to Settings → Store Settings to add categories/services




