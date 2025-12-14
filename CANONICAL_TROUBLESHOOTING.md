# Canonical Products Troubleshooting Guide

## 🔍 Problem: No Canonical Products Created

You've uploaded images but there are no canonical products in the `canonical_products` table.

## ✅ Quick Fix: Run Manual SQL Script

### Option 1: Run SQL Script in Supabase Dashboard (RECOMMENDED)

1. **Open Supabase Dashboard**
   ```
   https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb
   ```

2. **Go to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy & Paste SQL Script**
   - Open: `MANUAL_CANONICAL_FIX.sql`
   - Copy ALL the SQL
   - Paste into SQL Editor

4. **Run Step by Step**
   - Run STEP 1 first (check current state)
   - If you see `products_without_canonical > 0`, continue
   - Run STEP 2 (create canonical products)
   - Run STEP 3-6 (link products)
   - Run STEP 7 (verify fix)

5. **Expected Result**
   ```sql
   -- You should see something like:
   | status     | total_products | products_with_canonical | products_without_canonical | percent_linked |
   |------------|----------------|-------------------------|----------------------------|----------------|
   | AFTER FIX  | 500            | 500                     | 0                          | 100.00         |
   ```

### Option 2: Run Migration Script

```bash
cd /Users/user/Desktop/Bike/bike-dashboard
npm run migrate:canonical -- --dry-run  # Preview changes
npm run migrate:canonical                # Run for real
```

## 🐛 Debugging: Check What Happened During Sync

### View Edge Function Logs

1. **Open Supabase Dashboard**
   ```
   https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/functions
   ```

2. **Click on "sync-lightspeed-inventory"**

3. **Go to "Logs" tab**

4. **Look for Canonical Matching Logs**
   Search for:
   ```
   🔍 [CANONICAL MATCHING] Starting bulk match
   📊 [CANONICAL MATCHING] Found X unique UPCs
   ✅ [CANONICAL MATCHING] Found X existing canonical products
   📈 [CANONICAL MATCHING] Summary:
   ```

5. **What to Look For**
   - **If you see no logs**: Function wasn't called or crashed before matching
   - **If logs show "0 products"**: Products array was empty
   - **If logs show errors**: Copy the error message

### Check Database Directly

Run these queries in Supabase SQL Editor:

```sql
-- 1. Check if canonical_products table exists and has data
SELECT COUNT(*) as canonical_count FROM canonical_products;
-- Expected: Should show number of unique products

-- 2. Check if products have canonical_product_id
SELECT 
  COUNT(*) as total,
  COUNT(canonical_product_id) as with_canonical,
  COUNT(*) - COUNT(canonical_product_id) as without_canonical
FROM products;
-- Expected: with_canonical should equal total

-- 3. Find products without canonical link
SELECT id, description, upc, canonical_product_id
FROM products
WHERE canonical_product_id IS NULL
LIMIT 10;
-- Expected: Should return 0 rows after fix

-- 4. Check if canonical products were actually created
SELECT * FROM canonical_products ORDER BY created_at DESC LIMIT 10;
-- Expected: Should see your products listed

-- 5. Check RLS policies on canonical_products
SELECT * FROM pg_policies WHERE tablename = 'canonical_products';
-- Expected: Should see policies allowing INSERT for authenticated users
```

## 🎯 Why This Happens

### Reason 1: Products Synced Before Canonical System
- You synced products **before** the canonical matching was implemented
- Old products don't have `canonical_product_id` 
- **Fix**: Run manual SQL script OR re-sync

### Reason 2: Edge Function Didn't Run Matching Code
- The canonical matching code exists but wasn't executed
- Possible causes:
  - Function crashed before reaching matching code
  - Import error in `canonical-matching.ts`
  - Supabase client permissions issue

### Reason 3: Database Permissions Issue
- Edge function can't INSERT into `canonical_products`
- RLS policies blocking inserts
- **Fix**: Check RLS policies

## 🔧 Testing the Fix

### Test 1: Check Canonical Products Exist

```sql
SELECT COUNT(*) FROM canonical_products;
```

**Expected**: Should return number > 0

**If 0**: Run the manual SQL script

### Test 2: Check Products Are Linked

```sql
SELECT 
  p.description,
  p.canonical_product_id,
  cp.normalized_name
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
LIMIT 5;
```

**Expected**: Every product should have a canonical_product_id and canonical name

**If NULL**: Run STEP 3-6 from manual SQL script

### Test 3: Test "Images" Button

1. Go to Products page: `http://localhost:3000/products`
2. Click "Images" button (should be enabled now)
3. Dialog should open ✅
4. Try uploading an image

### Test 4: Verify Upload Works

```sql
-- After uploading an image, check product_images table
SELECT * FROM product_images ORDER BY created_at DESC LIMIT 1;
```

**Expected**: Should see your uploaded image record

## 🚀 Next Sync Will Work Automatically

After running the manual fix:

1. **Future syncs will work automatically** ✅
2. The edge function now has extensive logging
3. You can monitor logs in Supabase Dashboard
4. New products will auto-create canonical entries

### To See Logs on Next Sync:

1. Go to Products → Click "Sync"
2. While syncing, open Supabase Dashboard → Functions → Logs
3. Watch for canonical matching logs:
   ```
   🔍 [CANONICAL MATCHING] Starting bulk match for X products
   📊 [CANONICAL MATCHING] Found X unique UPCs to match
   ✅ [CANONICAL MATCHING] Found X existing canonical products
   🔗 [CANONICAL MATCHING] Matched X products to existing canonical
   + [CANONICAL MATCHING] Creating new canonical for product...
   📈 [CANONICAL MATCHING] Summary:
      - Total products: 100
      - UPC matched: 75
      - Name matched: 15
      - New created: 10
      - Final mapped: 100/100
   ```

## 📊 Understanding the Matching Process

### Priority Order:

1. **UPC Exact Match** (fastest, 100% confidence)
   - Looks up existing canonical product by UPC
   - If found → Link product immediately

2. **Fuzzy Name Match** (slower, 85%+ confidence)
   - Uses PostgreSQL trigram similarity
   - If similarity ≥ 85% → Link product
   - If similarity 70-84% → Needs review

3. **Create New** (fallback)
   - No match found → Create new canonical product
   - Generate temp UPC if product has no UPC

### What Gets Created:

```
Product: "Trek Fuel EX 9.8" (UPC: 123456789)
    ↓
Canonical Product Created:
    - id: uuid-generated
    - upc: "123456789"
    - normalized_name: "trek fuel ex 98"
    - category: "Bikes"
    ↓
Product Updated:
    - canonical_product_id: uuid-generated
    ↓
Now you can upload images! ✅
```

## ❓ Common Questions

### Q: Why aren't images uploading?
**A**: Products need `canonical_product_id` first. Run the manual SQL fix.

### Q: Can I manually create canonical products?
**A**: Yes! Use the SQL script or insert directly:
```sql
INSERT INTO canonical_products (upc, normalized_name, category)
VALUES ('123456789', 'trek fuel ex 98', 'Bikes');
```

### Q: What if two products have the same UPC?
**A**: They share the same canonical product (that's the point!) and the same images.

### Q: How do I upload images manually via SQL?
**A**: Don't! Use the UI. Images need to be stored in Supabase Storage, not just database.

### Q: Can I see the matching algorithm in action?
**A**: Yes! Check Supabase Functions logs after running a sync.

## 🆘 Still Not Working?

Run this diagnostic:

```sql
-- Full diagnostic query
SELECT 
  'Products' as table_name,
  COUNT(*) as total,
  COUNT(canonical_product_id) as with_canonical
FROM products
UNION ALL
SELECT 
  'Canonical Products' as table_name,
  COUNT(*) as total,
  NULL as with_canonical
FROM canonical_products
UNION ALL
SELECT 
  'Product Images' as table_name,
  COUNT(*) as total,
  COUNT(DISTINCT canonical_product_id) as unique_canonical
FROM product_images;
```

**Share the output** and I can help debug further!

## ✅ Success Checklist

After running the fix:

- [ ] `canonical_products` table has records
- [ ] All products have `canonical_product_id`
- [ ] "Images" button is enabled on products page
- [ ] Clicking "Images" opens the dialog
- [ ] Can upload images successfully
- [ ] Images appear in the gallery
- [ ] Future syncs create canonical products automatically
- [ ] Edge function logs show canonical matching activity

---

**TL;DR**: Run `MANUAL_CANONICAL_FIX.sql` in Supabase SQL Editor to create canonical products for existing products. Future syncs will work automatically!














