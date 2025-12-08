# Verify Image Discovery Flow

## Complete Data Flow

This document verifies that the image discovery feature correctly updates the `product_images` table and triggers the cache update.

## The Complete Flow 🔄

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User clicks empty image placeholder                          │
│    - Product must have canonical_product_id                     │
│    - Search query: "cycling [product_name]"                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Frontend calls API: /api/admin/images/discover              │
│    Body: {                                                       │
│      canonicalProductId: "uuid",                                │
│      customSearchQuery: "cycling Trek Madone 2024"              │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. API calls Edge Function: discover-product-images            │
│    - Passes custom search query to OpenAI                       │
│    - OpenAI returns 5-15 cycling-specific image URLs            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Edge Function saves to product_images table                 │
│    INSERT INTO product_images:                                  │
│      - canonical_product_id: "uuid"                             │
│      - external_url: "https://..."                              │
│      - approval_status: 'pending' ✨                            │
│      - is_primary: false (except first one)                     │
│      - is_downloaded: false                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Frontend polls product_images table                         │
│    SELECT * FROM product_images                                 │
│    WHERE canonical_product_id = 'uuid'                          │
│      AND approval_status = 'pending'                            │
│    Every 2 seconds, max 20 times                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. User approves/rejects images                                │
│    UPDATE product_images                                        │
│    SET approval_status = 'approved'/'rejected'                  │
│    WHERE id = 'image-uuid'                                      │
│    ⚡ Trigger fires: refresh_product_image_on_change           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. User sets primary image (⭐)                                 │
│    UPDATE product_images SET is_primary = false                 │
│    WHERE canonical_product_id = 'uuid';                         │
│                                                                  │
│    UPDATE product_images SET is_primary = true                  │
│    WHERE id = 'selected-image-uuid';                            │
│    ⚡ Trigger fires: refresh_product_image_on_change           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. User clicks "Save Selection"                                │
│    DELETE FROM product_images                                   │
│    WHERE id IN ('rejected-ids', 'pending-ids')                  │
│    ⚡ Trigger fires: refresh_product_image_on_change           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Trigger: refresh_product_cached_image()                     │
│    - Finds primary approved image for canonical_product_id     │
│    - Updates ALL products.cached_image_url with that ID        │
│    - Sets has_displayable_image = true                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Products table updated ✅                                   │
│     UPDATE products                                             │
│     SET cached_image_url = 'https://cloudinary.../card.jpg',   │
│         cached_thumbnail_url = 'https://...',                   │
│         has_displayable_image = true                            │
│     WHERE canonical_product_id = 'uuid'                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 11. Marketplace displays new image 🎉                           │
│     - Product cards read products.cached_image_url             │
│     - All stores with this product see the new image           │
└─────────────────────────────────────────────────────────────────┘
```

## Verification Steps

### Step 1: Check Product Has Canonical ID

```sql
-- Find a test product
SELECT 
  id,
  description,
  canonical_product_id,
  cached_image_url
FROM products
WHERE canonical_product_id IS NOT NULL
  AND cached_image_url IS NULL
LIMIT 1;
```

Copy the `id` and `canonical_product_id` for next steps.

### Step 2: Trigger Image Discovery

1. Open products page: `/products`
2. Find the product (use search if needed)
3. Click the sparkles icon (empty image placeholder)
4. **Open browser console** (F12 → Console tab)
5. Watch for logs:
   ```
   [DISCOVER] Starting discovery for: cycling [product_name]
   [DISCOVER] Canonical Product ID: uuid
   [DISCOVER] Result: { success: true, ... }
   [DISCOVER] Polling 1/20 for canonical_product_id: uuid
   [DISCOVER] ✅ Found N pending images: [...]
   ```

### Step 3: Verify Images Were Saved

```sql
-- Check images were created
SELECT 
  id,
  canonical_product_id,
  external_url,
  approval_status,
  is_primary,
  is_downloaded,
  created_at
FROM product_images
WHERE canonical_product_id = 'YOUR_CANONICAL_ID_HERE'
ORDER BY created_at DESC;
```

**Expected Results:**
- 5-15 rows with `approval_status = 'pending'`
- `external_url` should be populated
- `is_downloaded = false` (not downloaded yet)
- One image might have `is_primary = true`

### Step 4: Approve Images

In the modal:
1. Click 2-3 good images (green ring = approved)
2. Click 1-2 bad images twice (red ring = rejected)
3. Watch console:
   ```
   [APPROVE] Changing image uuid from pending to approved
   [APPROVE] ✅ Updated image uuid to approved
   ```

### Step 5: Set Primary Image

1. Click ⭐ star on best approved image
2. Watch console:
   ```
   [PRIMARY] Setting image uuid as primary for canonical product uuid
   [PRIMARY] Unsetting all primaries for canonical product
   [PRIMARY] Setting new primary image
   [PRIMARY] ✅ Successfully set primary image
   ```

### Step 6: Verify Database Updates

```sql
-- Check approval statuses changed
SELECT 
  id,
  approval_status,
  is_primary
FROM product_images
WHERE canonical_product_id = 'YOUR_CANONICAL_ID_HERE'
ORDER BY is_primary DESC, approval_status;
```

**Expected Results:**
- Some images: `approval_status = 'approved'`
- Some images: `approval_status = 'rejected'` (if you rejected any)
- Exactly ONE image: `is_primary = true AND approval_status = 'approved'`

### Step 7: Complete Selection

1. Click "Save Selection" button
2. Watch console:
   ```
   [COMPLETE] Starting image selection completion
   [COMPLETE] Approved images: 3
   [COMPLETE] Has primary: true
   [COMPLETE] Will delete 2 non-approved images
   [COMPLETE] ✅ Deleted 2 rejected images
   [COMPLETE] ✅ Image selection complete! Refreshing products...
   [COMPLETE] Trigger should have updated cached_image_url...
   ```

### Step 8: Verify Trigger Executed

```sql
-- Check if cached_image_url was updated
SELECT 
  p.id,
  p.description,
  p.cached_image_url,
  p.cached_thumbnail_url,
  p.has_displayable_image,
  pi.card_url as primary_image_url,
  pi.is_primary,
  pi.approval_status,
  CASE 
    WHEN p.cached_image_url = pi.card_url THEN '✅ MATCH'
    WHEN p.cached_image_url = pi.cloudinary_url THEN '✅ MATCH (cloudinary)'
    WHEN p.cached_image_url = pi.external_url THEN '✅ MATCH (external)'
    ELSE '❌ MISMATCH'
  END as verification
FROM products p
JOIN product_images pi ON p.canonical_product_id = pi.canonical_product_id
WHERE p.canonical_product_id = 'YOUR_CANONICAL_ID_HERE'
  AND pi.is_primary = true
  AND pi.approval_status = 'approved';
```

**Expected Results:**
- `cached_image_url` should be populated
- `verification` should show `✅ MATCH`
- `has_displayable_image` should be `true`

### Step 9: Verify Products Table

```sql
-- Check ALL products with this canonical_product_id were updated
SELECT 
  id,
  description,
  user_id,
  cached_image_url,
  has_displayable_image
FROM products
WHERE canonical_product_id = 'YOUR_CANONICAL_ID_HERE';
```

**Expected Results:**
- ALL rows should have `cached_image_url` populated
- ALL rows should have same `cached_image_url` (shared primary image)
- ALL rows should have `has_displayable_image = true`

### Step 10: Verify Marketplace Display

1. Go to marketplace page: `/marketplace`
2. Search for the product
3. **Verify**: Product card shows the new primary image
4. **Verify**: Image loads from Cloudinary (check Network tab)

## Troubleshooting

### Issue: Images don't appear after discovery

**Check:**
1. Browser console for errors
2. Supabase logs for edge function errors
3. Run this query:
   ```sql
   SELECT COUNT(*) FROM product_images
   WHERE canonical_product_id = 'YOUR_ID'
   AND approval_status = 'pending';
   ```
   If count = 0, images weren't saved.

### Issue: Cached URL not updating

**Check trigger exists:**
```sql
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'refresh_product_image_on_change';
```

**Manually run trigger:**
```sql
-- Force trigger to run
UPDATE product_images 
SET approval_status = approval_status 
WHERE canonical_product_id = 'YOUR_ID' AND is_primary = true;

-- Check if it updated
SELECT cached_image_url FROM products 
WHERE canonical_product_id = 'YOUR_ID';
```

### Issue: Wrong image showing

**Check primary image:**
```sql
SELECT id, external_url, card_url, is_primary, approval_status
FROM product_images
WHERE canonical_product_id = 'YOUR_ID'
  AND is_primary = true;
```

Should return exactly 1 row with `approval_status = 'approved'`.

## Console Output Reference

### Successful Discovery
```
[DISCOVER] Starting discovery for: cycling Trek Madone 2024
[DISCOVER] Canonical Product ID: abc-123-...
[DISCOVER] Result: { success: true, message: "..." }
[DISCOVER] Polling 1/20 for canonical_product_id: abc-123-...
[DISCOVER] Polling 2/20 for canonical_product_id: abc-123-...
[DISCOVER] ✅ Found 8 pending images: [...]
[DISCOVER] Mapped images: [...]
```

### Successful Approval
```
[APPROVE] Changing image xyz-456 from pending to approved
[APPROVE] ✅ Updated image xyz-456 to approved
```

### Successful Primary Set
```
[PRIMARY] Setting image xyz-456 as primary for canonical product abc-123
[PRIMARY] Unsetting all primaries for canonical product
[PRIMARY] Setting new primary image
[PRIMARY] ✅ Successfully set primary image
```

### Successful Completion
```
[COMPLETE] Starting image selection completion
[COMPLETE] Approved images: 3
[COMPLETE] Has primary: true
[COMPLETE] Will delete 5 non-approved images
[COMPLETE] ✅ Deleted 5 rejected images
[COMPLETE] ✅ Image selection complete! Refreshing products...
[COMPLETE] Canonical Product ID: abc-123-...
[COMPLETE] Trigger should have updated cached_image_url...
```

## Summary Checklist

- [ ] Product has `canonical_product_id`
- [ ] Click image placeholder triggers discovery
- [ ] Edge function saves images with `approval_status = 'pending'`
- [ ] Frontend polls and displays pending images
- [ ] Click images changes `approval_status` in database
- [ ] Click ⭐ sets `is_primary = true` in database
- [ ] "Save Selection" deletes non-approved images
- [ ] Trigger `refresh_product_image_on_change` fires on UPDATE/DELETE
- [ ] `products.cached_image_url` gets updated
- [ ] ALL products with same `canonical_product_id` are updated
- [ ] Marketplace product cards display new image

**If all checkboxes pass: ✅ System is working correctly!**

