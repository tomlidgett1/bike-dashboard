# Image Upload Integration - Quick Start Guide

## ✅ What Was Just Integrated

The image management system is now **fully integrated** into your Products page!

## 🎯 How to Use It

### Step 1: Navigate to Products Page
```
Dashboard → Products
```

### Step 2: Find the "Images" Button
- Each product row now has an **"Images" button** in the Actions column
- The button is **disabled** if the product hasn't been matched to a canonical product yet
- The button is **enabled** if the product has a canonical_product_id

### Step 3: Click "Images" to Open Gallery
- A dialog opens with the full image gallery
- Shows all existing images for that product
- Allows you to upload new images
- Set primary image
- Delete images
- Reorder images

### Step 4: Upload Images
1. Click **"Upload Images"** button in the gallery
2. Drag and drop images OR click to select
3. Supports: JPEG, PNG, WebP (max 10MB, up to 10 files)
4. Preview your images before upload
5. Click **"Upload All"**
6. Images are processed and stored
7. Gallery refreshes automatically

## 🔄 What Happens During Upload

```
User uploads image
    ↓
Validation (type, size)
    ↓
POST to /api/images/upload
    ↓
Upload to Supabase Storage
    ↓
Create product_images record
    ↓
Link to canonical_product_id
    ↓
Gallery refreshes
    ↓
Image appears for ALL stores selling this product
```

## 🚨 Important Notes

### Products Need Canonical Matching First

**If "Images" button is disabled:**
- The product hasn't been matched to a canonical product yet
- This happens automatically during Lightspeed sync
- Products with matching UPCs are auto-linked
- Products without matches need manual review

**To fix:**
1. The product will be in the `image_match_queue` table
2. Future feature: Manual matching UI
3. For now: Products sync automatically with canonical matching

### Images Are Shared Across Stores

- When you upload images for "Trek Fuel EX 9.8", those images are stored in the **canonical product**
- **All stores** selling "Trek Fuel EX 9.8" will see the same images
- This eliminates duplicate uploads and saves storage
- Individual stores can override with custom images if needed

## 📊 Testing the Feature

### Test Case 1: Upload Images
1. Go to Products page
2. Find a product with enabled "Images" button
3. Click "Images"
4. Upload 2-3 test images
5. Verify they appear in the gallery
6. Set one as primary
7. Refresh the products page
8. Verify the primary image shows in the product thumbnail

### Test Case 2: Multiple Stores
1. Sync products from Store A
2. Upload images for "Product X"
3. Sync same product from Store B
4. Check Store B's "Product X"
5. Should show same images from Store A ✅

### Test Case 3: Delete Images
1. Open image gallery
2. Hover over an image
3. Click "Delete"
4. Confirm deletion
5. Image disappears from gallery

## 🔧 Troubleshooting

### "Images" Button is Disabled

**Cause:** Product doesn't have canonical_product_id

**Solution:** 
- Product needs to be matched first
- Check if product has a UPC code
- Re-sync from Lightspeed to trigger matching
- Check `image_match_queue` table for matching status

### Upload Fails

**Possible causes:**
1. File too large (>10MB)
2. Invalid file type (not JPEG/PNG/WebP)
3. Supabase Storage bucket not set up
4. RLS policies not configured

**Check:**
```sql
-- Verify storage bucket exists
SELECT * FROM storage.buckets WHERE id = 'product-images';

-- Verify RLS policies
SELECT * FROM storage.policies WHERE bucket_id = 'product-images';
```

### Images Don't Appear

**Check:**
1. Browser console for errors
2. Network tab for failed requests
3. Supabase Storage dashboard
4. product_images table has records

**Debug query:**
```sql
SELECT * FROM product_images 
WHERE canonical_product_id = 'your-canonical-id';
```

## 🚀 Next Steps

### Immediate Actions
1. ✅ Test the upload feature with sample products
2. ✅ Upload images for your most popular products
3. ✅ Verify images appear on marketplace (when you build it)

### Future Enhancements
1. **Bulk Upload** - Upload images for multiple products at once
2. **Image Cropping** - Crop images before upload
3. **AI Auto-Tagging** - Automatic image classification
4. **Manual Matching UI** - Interface to manually match products to canonical
5. **Image Analytics** - Track which images perform best
6. **Custom Image Override** - Per-store custom images

## 📝 Component Structure

```
Products Page (products/page.tsx)
  └─ Table Row
      └─ "Images" Button
          └─ Dialog (Dialog component)
              └─ ImageGallery (image-gallery.tsx)
                  ├─ Display existing images
                  ├─ "Upload Images" button
                  │   └─ Dialog (nested)
                  │       └─ ImageUploader (image-uploader.tsx)
                  │           ├─ Drag & drop zone
                  │           ├─ File validation
                  │           ├─ Preview grid
                  │           └─ Upload all button
                  ├─ Set primary button
                  └─ Delete button
```

## 🎨 UI Features

- ✅ Drag and drop upload
- ✅ Multiple file selection
- ✅ Image preview before upload
- ✅ Upload progress indicators
- ✅ Success/error states
- ✅ Primary image badge
- ✅ Hover actions on images
- ✅ Responsive grid layout
- ✅ Smooth animations (matching your design rules)
- ✅ White backgrounds with rounded-md borders
- ✅ Loading skeletons

## 🔗 API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/images/upload` | POST | Upload new image |
| `/api/products/[id]/images` | GET | Fetch product images |
| `/api/products/[id]/images` | PATCH | Update image (set primary, reorder) |
| `/api/products/[id]/images` | DELETE | Delete image |
| `/api/images/match` | POST | Find canonical match |

---

**Need Help?** Check the main documentation in `IMAGE_STORAGE_SYSTEM.md` for complete system architecture and troubleshooting.















