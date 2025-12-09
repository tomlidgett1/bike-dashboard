# Debug: Check Products Canonical Status

## Quick Check in Browser Console

1. Open Products page: http://localhost:3000/products
2. Press F12 to open DevTools
3. Go to Console tab
4. Paste this code:

```javascript
// Check first product in the table
fetch('/api/products?page=1&pageSize=1')
  .then(r => r.json())
  .then(data => {
    const product = data.products[0];
    console.log('Product:', product.description);
    console.log('Has canonical_product_id:', !!product.canonical_product_id);
    console.log('canonical_product_id value:', product.canonical_product_id);
    console.log('Button should be:', product.canonical_product_id ? 'ENABLED ✅' : 'DISABLED ❌');
  });
```

## Expected Output

### If Product is Matched (Button ENABLED):
```
Product: Trek Fuel EX 9.8
Has canonical_product_id: true
canonical_product_id value: "550e8400-e29b-41d4-a716-446655440000"
Button should be: ENABLED ✅
```

### If Product is NOT Matched (Button DISABLED):
```
Product: Specialized Stumpjumper
Has canonical_product_id: false
canonical_product_id value: null
Button should be: DISABLED ❌
```

## SQL Query to Check Database Directly

If you have access to Supabase dashboard:

```sql
-- Check how many products have canonical_product_id
SELECT 
  COUNT(*) FILTER (WHERE canonical_product_id IS NOT NULL) as matched_products,
  COUNT(*) FILTER (WHERE canonical_product_id IS NULL) as unmatched_products,
  COUNT(*) as total_products
FROM products;
```

## If ALL Products Are Unmatched

This means the canonical matching didn't run during sync. To fix:

1. **Option A: Re-sync from Lightspeed**
   - Go to: Dashboard → Sync Inventory
   - Click "Sync Now"
   - The sync will now include canonical matching

2. **Option B: Run Migration Script**
   ```bash
   cd /Users/user/Desktop/Bike/bike-dashboard
   npm run migrate:canonical -- --dry-run  # Preview
   npm run migrate:canonical                # Actually run it
   ```

## If Dialog Opens But You Can't See It

Check if there's CSS issue:
1. Open DevTools (F12)
2. Click "Images" button
3. In Elements tab, search for: `[data-slot="dialog-content"]`
4. Check if it has style: `display: none` or `opacity: 0`

If you find it, the dialog is rendering but hidden. This could be z-index issue.

## Common Solutions

### Solution 1: Products Need Canonical Matching
```bash
# Navigate to Sync page and click "Sync Now"
# OR run migration:
npm run migrate:canonical
```

### Solution 2: Clear Cache and Rebuild
```bash
cd /Users/user/Desktop/Bike/bike-dashboard
rm -rf .next
npm run dev
```

### Solution 3: Check Browser Console for Specific Error
- Look for error message
- Copy full error
- That will tell us exactly what's wrong

## Test with Known Good Product

Create a test product with canonical_product_id:

1. Go to Supabase Dashboard
2. Open Products table
3. Pick any product
4. Manually set canonical_product_id to any UUID (or create one)
5. Refresh products page
6. Try clicking "Images" button on that product










