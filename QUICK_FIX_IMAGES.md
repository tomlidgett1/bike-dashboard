# Quick Fix: Images Not Showing

## 🔍 The Problem

Two issues:
1. **Images not showing in products table** - Likely products don't have `canonical_product_id`
2. **"Failed to fetch images"** - API can't find images because product not linked to canonical

## ✅ Quick Fix (5 minutes)

### Step 1: Run the Canonical Products Fix

1. **Open Supabase Dashboard**
   ```
   https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/editor
   ```

2. **Go to SQL Editor** (left sidebar)

3. **Run this single query first to check status:**
   ```sql
   SELECT 
     COUNT(*) as total_products,
     COUNT(canonical_product_id) as with_canonical,
     COUNT(*) - COUNT(canonical_product_id) as without_canonical
   FROM products;
   ```

4. **If `without_canonical` > 0**, open `MANUAL_CANONICAL_FIX.sql` and run ALL the steps

### Step 2: Verify Fix Worked

Run this query:
```sql
SELECT 
  description,
  canonical_product_id,
  CASE 
    WHEN canonical_product_id IS NOT NULL THEN '✅ HAS CANONICAL'
    ELSE '❌ MISSING CANONICAL'
  END as status
FROM products
LIMIT 10;
```

**Expected**: All should show ✅ HAS CANONICAL

### Step 3: Check Browser Console

1. Open browser (press F12)
2. Go to Console tab
3. Click "Images" button on any product
4. Look for logs starting with `[GET IMAGES]`
5. Copy any error messages you see

## 🐛 Debug: What's Happening

I've added extensive logging. Check the browser console for:

```
[GET IMAGES] Starting request for product: abc-123
[GET IMAGES] User authenticated: user-id
[GET IMAGES] Product canonical_product_id: xyz-789
[GET IMAGES] Found images: 3
```

**If you see:**
- `No canonical_product_id - product not matched yet` → Run MANUAL_CANONICAL_FIX.sql
- `Found images: 0` → No images uploaded yet OR storage issue
- `Product not found` → Product ID wrong
- `Auth error` → User not logged in

## 🧪 Test With Specific Product

1. **Open browser console** (F12)
2. **Paste this code:**

```javascript
// Get first product
fetch('/api/products?page=1&pageSize=1')
  .then(r => r.json())
  .then(data => {
    const product = data.products[0];
    console.log('Product ID:', product.id);
    console.log('Has canonical_product_id:', product.canonical_product_id);
    
    // Try to fetch images
    return fetch(`/api/products/${product.id}/images`);
  })
  .then(r => r.json())
  .then(data => {
    console.log('Images API response:', data);
  })
  .catch(err => {
    console.error('Error:', err);
  });
```

3. **Look at the output** - this will tell you exactly what's failing

## 📊 Common Error Messages

### Error: "Product not found"
**Cause**: Product ID is wrong or doesn't exist  
**Fix**: Check the product actually exists in database

### Error: "Failed to fetch images"
**Cause**: Multiple possible issues  
**Fix**: Check browser console for specific error with `[GET IMAGES]` prefix

### Error: No canonical_product_id
**Cause**: Product not matched to canonical product yet  
**Fix**: Run `MANUAL_CANONICAL_FIX.sql`

### No error, but images array is empty
**Cause**: No images uploaded yet for this product  
**Fix**: Upload an image first

## 🚀 After Fix

Once canonical products are created:

1. **Refresh products page**
2. **Click "Images" button** - should open without error
3. **Gallery should show:**
   - Empty state if no images
   - OR existing images if any uploaded
4. **Upload an image**
5. **Refresh page** - image should appear in table thumbnail

## 📝 Run This Diagnostic

Open Supabase SQL Editor and run `DEBUG_IMAGE_ISSUES.sql` - it will check:
- ✓ Products have canonical_product_id
- ✓ Canonical products table has data
- ✓ Product images table has data
- ✓ RLS policies are correct
- ✓ Storage bucket is public

Then share the results and I can tell you exactly what's wrong!

## 🆘 Still Not Working?

1. Run `DEBUG_IMAGE_ISSUES.sql` in Supabase
2. Open browser console (F12)
3. Click "Images" button
4. Copy all `[GET IMAGES]` logs
5. Share those logs - they'll tell us exactly what's failing

The extensive logging I just added will pinpoint the exact issue! 🔍

