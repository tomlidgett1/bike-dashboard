# Image QA Primary Image Update Fix

## The Problem 🐛

When using the Admin Image QA page (`/admin/image-qa`) to set a primary image for canonical products, the primary image displayed on marketplace product cards was **NOT updating** in real-time.

### Why This Happened

1. **Home/Marketplace displays images from**: `products.cached_image_url` field
   - See: `/api/marketplace/products/route.ts` line 266
   
2. **Product cards check this priority order** (see `product-card.tsx` lines 64-95):
   - Priority 1: `product.card_url` (from `cached_image_url`)
   - Priority 2: Private listing images with `isPrimary` flag
   - Priority 3: Legacy image variants
   - Priority 4: Direct `primary_image_url`

3. **Admin Image QA updates**: `product_images.is_primary` field
   - When you click the ⭐ star button, it sets `is_primary = true` for selected image
   - It sets `is_primary = false` for all other images
   - These images have `canonical_product_id` set (not `product_id`)

4. **The database trigger was broken**: `refresh_product_image_on_change`
   - It was supposed to update `cached_image_url` when `product_images` changed
   - BUT: It only handled `product_id` changes (private listings)
   - It ignored `canonical_product_id` changes (store inventory)
   - Result: The marketplace cards kept showing the old image! 😱

## The Solution ✅

**Created migration**: `20251207120000_fix_canonical_product_image_refresh.sql`

### What It Does

1. **Updated the trigger function** `refresh_product_cached_image()`:
   - Now handles BOTH `product_id` (private listings) AND `canonical_product_id` (store inventory)
   - When a canonical product image changes, it updates ALL products that reference that canonical product

2. **Key Changes**:
   ```sql
   -- OLD CODE (broken):
   v_product_id := COALESCE(NEW.product_id, OLD.product_id);
   IF v_product_id IS NULL THEN
     RETURN COALESCE(NEW, OLD); -- ❌ Returns early for canonical products!
   END IF;
   
   -- NEW CODE (fixed):
   v_product_id := COALESCE(NEW.product_id, OLD.product_id);
   v_canonical_product_id := COALESCE(NEW.canonical_product_id, OLD.canonical_product_id);
   
   -- Handle both cases:
   -- Case 1: Direct product images (private listings)
   -- Case 2: Canonical product images (store inventory) - updates ALL products!
   ```

3. **Backfilled existing data**:
   - Updated all 1,175 products with correct primary images from their canonical products
   - Used proper priority: `is_primary DESC`, then `sort_order ASC`, then `created_at ASC`

## How It Works Now 🎉

### Admin Image QA Workflow

1. Admin opens `/admin/image-qa` page
2. Reviews product images from `canonical_products` table
3. Clicks images to approve/reject (cycles through statuses)
4. Clicks ⭐ star on approved image to set as primary
5. **TRIGGER FIRES**: `refresh_product_image_on_change`
   - Detects `canonical_product_id` from the changed image
   - Finds the new primary image (ordered by `is_primary DESC`)
   - **Updates ALL `products` that reference this canonical product**
   - Sets their `cached_image_url` and `cached_thumbnail_url`
6. Marketplace/home page now shows the updated primary image immediately! ✨

### Database Tables Involved

**Table: `product_images`**
- Stores all product images (both private listings and canonical products)
- Fields: `product_id`, `canonical_product_id`, `is_primary`, `card_url`, `cloudinary_url`, `approval_status`

**Table: `canonical_products`**
- Master product catalog (e.g., "Trek Madone 2024")
- Referenced by multiple store inventory products via `canonical_product_id`

**Table: `products`**
- Individual store products (store inventory from Lightspeed)
- Fields: `canonical_product_id`, `cached_image_url`, `cached_thumbnail_url`
- **This is what the marketplace displays**

**Trigger: `refresh_product_image_on_change`**
- Fires on INSERT, UPDATE, DELETE on `product_images` table
- Automatically updates `products.cached_image_url` for affected products

## Testing

To test the fix:

1. Open `/admin/image-qa` page
2. Find a product with multiple images
3. Click ⭐ on a different approved image to set as primary
4. Go to the marketplace home page
5. Find the product card for that product
6. ✅ **It should now show the newly selected primary image!**

## Performance Impact

- **Minimal**: The trigger uses indexed queries (`is_primary DESC`, `canonical_product_id`)
- **Scope**: Only updates products that actually reference the changed canonical product
- **Network**: No additional API calls needed - all handled in database

## Migration Applied

```bash
✅ Applied: 20251207120000_fix_canonical_product_image_refresh.sql
✅ Backfilled: 1,175 products updated with correct primary images
```

## Summary

| What | Where | Field |
|------|-------|-------|
| **Admin sets primary** | `/admin/image-qa` | `product_images.is_primary` |
| **Trigger updates** | Database | `products.cached_image_url` |
| **Marketplace displays** | `/marketplace`, home | `product.card_url` (from `cached_image_url`) |

Now when you set a primary image in Image QA, the marketplace product cards update automatically! 🎉

