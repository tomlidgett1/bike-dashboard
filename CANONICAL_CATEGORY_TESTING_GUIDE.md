# Canonical Category System - Testing & Validation Guide

## Overview
This guide walks through testing the new canonical category system to ensure 100% category coverage across all product upload methods.

## Prerequisites
- Database migration applied: `20251208045437_add_marketplace_categories_to_canonical.sql`
- Edge function deployed: `categorise-canonical-products`
- Backfill script run: `backfill_canonical_categories.sql`
- OpenAI API key configured in Supabase Edge Functions

---

## Phase 1: Database Setup Validation

### 1.1 Verify Schema Changes
Run in Supabase SQL Editor:

```sql
-- Check that canonical_products has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'canonical_products' 
  AND column_name IN (
    'marketplace_category', 
    'marketplace_subcategory', 
    'marketplace_level_3_category', 
    'display_name', 
    'cleaned'
  );
```

**Expected**: 5 rows returned (all columns exist)

### 1.2 Verify Triggers Exist
```sql
-- Check triggers are installed
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'sync_categories_after_canonical_link',
  'propagate_categories_to_products'
);
```

**Expected**: 2 triggers found

### 1.3 Verify Indexes
```sql
-- Check performance indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'canonical_products' 
  AND indexname LIKE '%marketplace%';
```

**Expected**: At least 4 indexes on marketplace category columns

---

## Phase 2: Backfill Validation

### 2.1 Run Backfill Script
1. Open Supabase SQL Editor
2. Paste contents of `backfill_canonical_categories.sql`
3. Execute the script
4. Review the output notices

**Expected Output**:
- Shows "Current State" statistics
- Shows number of canonical products updated
- Shows remaining uncategorised count

### 2.2 Verify Backfill Results
Run validation query:

```sql
-- Check how many canonical products got categories from backfill
SELECT 
  COUNT(*) FILTER (WHERE marketplace_category IS NOT NULL) as with_categories,
  COUNT(*) FILTER (WHERE marketplace_category IS NULL) as without_categories,
  ROUND(COUNT(*) FILTER (WHERE marketplace_category IS NOT NULL)::NUMERIC / COUNT(*) * 100, 2) as coverage_pct
FROM canonical_products;
```

**Expected**: Coverage should increase significantly (ideally 80%+ if you had existing categorised products)

---

## Phase 3: AI Categorisation Testing

### 3.1 Test Edge Function Directly
Use Supabase Edge Functions testing UI or curl:

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/categorise-canonical-products' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "processAll": false,
    "limit": 10
  }'
```

**Expected Response**:
```json
{
  "message": "Categorisation complete",
  "processed": 10,
  "succeeded": 10,
  "failed": 0,
  "successRate": 1
}
```

### 3.2 Test API Route
Make a POST request to `/api/admin/categorise-all-canonical`:

```javascript
// In browser console or test script
const response = await fetch('/api/admin/categorise-all-canonical', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    processAll: false,
    limit: 20
  })
});
const result = await response.json();
console.log(result);
```

**Expected**: Similar response as edge function, showing processed/succeeded/failed counts

### 3.3 Check GET Endpoint for Stats
```javascript
const stats = await fetch('/api/admin/categorise-all-canonical').then(r => r.json());
console.log(stats);
```

**Expected Response**:
```json
{
  "total": 1234,
  "categorised": 1150,
  "uncategorised": 84,
  "percentageCategorised": 93.19
}
```

---

## Phase 4: Trigger Testing

### 4.1 Manual Trigger Test
Run this SQL to manually test the trigger:

```sql
-- Create a test canonical product with categories
INSERT INTO canonical_products (
  upc, 
  normalized_name, 
  marketplace_category, 
  marketplace_subcategory,
  display_name,
  cleaned
) VALUES (
  'TEST-' || gen_random_uuid()::text,
  'test mountain bike',
  'Bicycles',
  'Mountain',
  'Test Mountain Bike',
  true
) RETURNING id;

-- Note the returned ID, then create a test product linked to it
-- Replace YOUR_USER_ID and CANONICAL_ID_FROM_ABOVE
INSERT INTO products (
  user_id,
  lightspeed_item_id,
  description,
  system_sku,
  price,
  canonical_product_id,
  is_active
) VALUES (
  'YOUR_USER_ID',
  'TEST-' || gen_random_uuid()::text,
  'Test Product for Trigger',
  'TEST-SKU',
  100,
  'CANONICAL_ID_FROM_ABOVE',
  true
) RETURNING id, marketplace_category, marketplace_subcategory;
```

**Expected**: The returned product should have:
- `marketplace_category` = 'Bicycles'
- `marketplace_subcategory` = 'Mountain'

### 4.2 Verify Trigger on Update
```sql
-- Update canonical product categories
UPDATE canonical_products 
SET 
  marketplace_category = 'E-Bikes',
  marketplace_subcategory = 'E-MTB'
WHERE id = 'CANONICAL_ID_FROM_ABOVE';

-- Check that linked products were updated
SELECT 
  id, 
  description, 
  marketplace_category, 
  marketplace_subcategory 
FROM products 
WHERE canonical_product_id = 'CANONICAL_ID_FROM_ABOVE';
```

**Expected**: Products should show updated categories ('E-Bikes', 'E-MTB')

### 4.3 Cleanup Test Data
```sql
-- Remove test products and canonical product
DELETE FROM products WHERE description = 'Test Product for Trigger';
DELETE FROM canonical_products WHERE normalized_name = 'test mountain bike';
```

---

## Phase 5: Upload Flow Testing

### 5.1 Test Lightspeed Sync
1. Navigate to Settings → Lightspeed Integration
2. Run a category sync or full sync
3. Monitor the sync progress
4. Check terminal/console logs for categorisation messages

**Expected Logs**:
```
🤖 [CATEGORISATION] Checking X canonical products for categorisation...
🤖 [CATEGORISATION] Found Y canonical products needing categorisation
✅ [CATEGORISATION] Categorised Y products (0 failed)
```

### 5.2 Verify Synced Products Have Categories
```sql
SELECT 
  p.id,
  LEFT(p.description, 50) as name,
  p.marketplace_category,
  p.marketplace_subcategory,
  p.canonical_product_id,
  cp.marketplace_category as canonical_cat
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
WHERE p.listing_source = 'lightspeed'
  AND p.is_active = true
ORDER BY p.created_at DESC
LIMIT 20;
```

**Expected**: All products should have matching categories from their canonical product

### 5.3 Test Facebook Import
1. Navigate to Marketplace → Sell
2. Click "Import from Facebook"
3. Paste a Facebook Marketplace listing URL
4. Complete the import process
5. Check the created listing

**Validation Query**:
```sql
SELECT 
  p.id,
  p.description,
  p.marketplace_category,
  p.marketplace_subcategory,
  p.canonical_product_id,
  p.facebook_source_url
FROM products p
WHERE p.listing_source = 'facebook_import'
  AND p.is_active = true
ORDER BY p.created_at DESC
LIMIT 5;
```

**Expected**: Product has categories and a canonical_product_id

### 5.4 Test Smart Upload
1. Navigate to Marketplace → Sell
2. Click "Quick Upload"
3. Upload 2-3 product photos
4. Let AI analyse the photos
5. Complete the listing

**Validation Query**:
```sql
SELECT 
  p.id,
  p.description,
  p.marketplace_category,
  p.marketplace_subcategory,
  p.canonical_product_id,
  p.smart_upload_metadata
FROM products p
WHERE p.listing_source = 'manual'
  AND p.smart_upload_metadata IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 5;
```

**Expected**: Product has categories and a canonical_product_id

### 5.5 Test Manual/Comprehensive Upload
1. Navigate to Marketplace → Sell
2. Choose "Comprehensive Listing"
3. Fill out the form manually
4. Submit the listing

**Validation Query**:
```sql
SELECT 
  p.id,
  p.description,
  p.marketplace_category,
  p.marketplace_subcategory,
  p.canonical_product_id
FROM products p
WHERE p.listing_source = 'manual'
  AND p.smart_upload_metadata IS NULL
ORDER BY p.created_at DESC
LIMIT 5;
```

**Expected**: Product has categories and a canonical_product_id

---

## Phase 6: Comprehensive Validation

### 6.1 Run Full Validation Suite
Execute `CANONICAL_CATEGORY_VALIDATION.sql` in Supabase SQL Editor.

This will output:
- ✅ System health check
- ✅ Products without categories (should be 0)
- ✅ Trigger validation
- ✅ Category distribution
- ✅ Coverage by source type
- ✅ Final success rate

### 6.2 Check for 100% Coverage
```sql
SELECT 
  CASE 
    WHEN COUNT(*) FILTER (WHERE marketplace_category IS NULL) = 0 
    THEN '✅ 100% COVERAGE - ALL PRODUCTS CATEGORISED'
    ELSE '❌ MISSING CATEGORIES: ' || COUNT(*) FILTER (WHERE marketplace_category IS NULL)::TEXT || ' products'
  END as status
FROM products
WHERE is_active = true;
```

**Expected**: "✅ 100% COVERAGE - ALL PRODUCTS CATEGORISED"

### 6.3 Validate Marketplace Display
1. Navigate to `/marketplace`
2. Check that all products display with categories
3. Use category filters to browse products
4. Verify filtering works correctly

**Visual Check**:
- All product cards show category badges
- Category filtering returns correct products
- No products show "Uncategorised"

---

## Phase 7: Performance Testing

### 7.1 Check Query Performance
```sql
EXPLAIN ANALYZE
SELECT 
  p.id,
  p.description,
  p.marketplace_category,
  p.marketplace_subcategory
FROM products p
WHERE p.is_active = true
  AND p.marketplace_category = 'Bicycles'
  AND p.marketplace_subcategory = 'Mountain'
LIMIT 50;
```

**Expected**: Query should use indexes and complete in < 50ms

### 7.2 Check Canonical Lookup Performance
```sql
EXPLAIN ANALYZE
SELECT 
  cp.id,
  cp.marketplace_category,
  cp.product_count
FROM canonical_products cp
WHERE cp.marketplace_category = 'E-Bikes'
  AND cp.cleaned = true;
```

**Expected**: Index scan, < 10ms

---

## Troubleshooting

### Issue: Products Missing Categories
**Possible Causes**:
1. Canonical product not categorised yet
2. Product not linked to canonical
3. Trigger not working

**Solution**:
```sql
-- Find products without categories
SELECT p.id, p.description, p.canonical_product_id
FROM products p
WHERE p.is_active = true AND p.marketplace_category IS NULL
LIMIT 10;

-- Check their canonical products
SELECT cp.id, cp.marketplace_category, cp.cleaned
FROM canonical_products cp
WHERE cp.id IN (SELECT canonical_product_id FROM products WHERE marketplace_category IS NULL);

-- Run categorisation on those canonical products
-- Use the /api/admin/categorise-all-canonical endpoint
```

### Issue: Trigger Not Working
**Solution**:
```sql
-- Manually trigger category sync for all products
UPDATE products p
SET 
  marketplace_category = cp.marketplace_category,
  marketplace_subcategory = cp.marketplace_subcategory,
  marketplace_level_3_category = cp.marketplace_level_3_category
FROM canonical_products cp
WHERE p.canonical_product_id = cp.id
  AND cp.marketplace_category IS NOT NULL;
```

### Issue: AI Categorisation Fails
**Check**:
1. OpenAI API key is set in Supabase Edge Functions
2. Check edge function logs in Supabase dashboard
3. Verify rate limits haven't been hit

**Solution**:
- Run categorisation in smaller batches (use `limit` parameter)
- Check OpenAI API status
- Review edge function logs for specific errors

---

## Success Criteria Checklist

- [ ] All database migrations applied successfully
- [ ] Triggers are installed and working
- [ ] Backfill completed with > 80% coverage
- [ ] AI categorisation edge function working
- [ ] API route responds correctly
- [ ] Lightspeed sync creates canonical products with categories
- [ ] Facebook import creates canonical products with categories
- [ ] Smart Upload creates canonical products with categories
- [ ] Manual upload creates canonical products with categories
- [ ] 100% of active products have categories
- [ ] Trigger updates products when canonical categories change
- [ ] Marketplace displays products with correct categories
- [ ] Category filtering works correctly
- [ ] No performance degradation (queries < 50ms)

---

## Maintenance

### Regular Checks
Run these queries monthly to ensure system health:

```sql
-- Check for uncategorised canonical products
SELECT COUNT(*) FROM canonical_products WHERE marketplace_category IS NULL;

-- Check for products without categories
SELECT COUNT(*) FROM products WHERE is_active = true AND marketplace_category IS NULL;

-- Check category distribution changes
SELECT marketplace_category, COUNT(*) 
FROM products 
WHERE is_active = true 
GROUP BY marketplace_category 
ORDER BY COUNT(*) DESC;
```

### Periodic Recategorisation
Run bulk categorisation quarterly to ensure categories are up-to-date:

```POST
POST /api/admin/categorise-all-canonical
{
  "processAll": true
}
```

This will recategorise ALL canonical products with the latest AI model and taxonomy.







