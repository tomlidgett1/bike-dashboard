# Products Page: AI Image Discovery Feature

## Overview

Added inline AI image discovery to the products page. When a product has no image, clicking the image placeholder triggers AI-powered image search with "cycling" prepended to the product name for better cycling-specific results.

## What's New ✨

### 1. Clickable Image Placeholders

**Before**: Empty image placeholders were just static icons
**Now**: Click the placeholder to discover images with AI

- Sparkles icon (✨) indicates clickable placeholder
- Only works for products without images
- Requires product to be matched to canonical catalog

### 2. Custom Search Query

**Search Pattern**: `cycling [product_name]`

For example:
- Product: "Trek Madone 2024"
- Search Query: `"cycling Trek Madone 2024"`

This ensures results are cycling-related (not random Trek products).

### 3. Interactive Image Selection Modal

When images are discovered, a modal appears with:

**Features**:
- Grid display of all discovered images
- Click images to cycle through states: pending → approved → rejected → pending
- Visual indicators:
  - ✅ Green ring = Approved
  - ⭕ Gray ring = Pending
  - ❌ Red ring = Rejected
- Click ⭐ star on approved images to set as primary
- Real-time status counts
- "Save Selection" button (only enabled when ≥1 approved + 1 primary)

**Workflow**:
1. Images load (15-25 seconds)
2. Review and click to approve/reject
3. Click ⭐ on one approved image to make it primary
4. Click "Save Selection"
5. Non-approved images are deleted
6. Product card updates with new primary image

## Technical Implementation

### API Endpoint Changes

**File**: `src/app/api/admin/images/discover/route.ts`

```typescript
// NEW: Accepts optional customSearchQuery parameter
const { canonicalProductId, customSearchQuery } = body;

// Passes to edge function
body: JSON.stringify({ 
  canonicalProductId,
  customSearchQuery 
})
```

### Edge Function Changes

**File**: `supabase/functions/discover-product-images/index.ts`

```typescript
// NEW: Accepts customSearchQuery
const { canonicalProductId, customSearchQuery } = await req.json()

// Uses custom query if provided, otherwise falls back to product name
const searchQuery = customSearchQuery || canonical.normalized_name

// Passes to OpenAI
const aiResult = await discoverProductImages(searchQuery, {...})
```

### Frontend Changes

**File**: `src/app/products/page.tsx`

**New State**:
```typescript
const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
const [discoveringProduct, setDiscoveringProduct] = useState<Product | null>(null);
const [discoveredImages, setDiscoveredImages] = useState<DiscoveredImage[]>([]);
const [discovering, setDiscovering] = useState(false);
```

**New Handlers**:
1. `handleDiscoverImages()` - Triggers AI discovery with "cycling [product_name]"
2. `handleToggleImageApproval()` - Cycles image status (pending/approved/rejected)
3. `handleSetPrimary()` - Sets an approved image as primary
4. `handleCompleteSelection()` - Saves approved images, deletes rejected ones

**UI Updates**:
- Image placeholder now a clickable button
- Sparkles icon for discoverability
- Hover effects (ring color changes to blue)
- Discovery modal with Framer Motion animations
- Loading spinner during discovery
- Image grid with status indicators

## Database Flow

```
1. User clicks image placeholder
   ↓
2. Frontend calls /api/admin/images/discover
   with: { canonicalProductId, customSearchQuery: "cycling [name]" }
   ↓
3. API calls edge function discover-product-images
   ↓
4. Edge function calls OpenAI with custom search query
   ↓
5. Edge function saves URLs to product_images table
   with: approval_status = 'pending'
   ↓
6. Frontend polls product_images table for pending images
   ↓
7. User approves/rejects images, sets primary
   ↓
8. User clicks "Save Selection"
   ↓
9. Frontend deletes rejected images via Supabase client
   ↓
10. Trigger: refresh_product_cached_image() fires
    ↓
11. Products table updated with cached_image_url
    ↓
12. Marketplace product cards display new image ✅
```

## User Experience

### Step-by-Step Usage

**1. Navigate to Products Page**
```
Settings → Products
```

**2. Find Product Without Image**
- Look for products with sparkles icon (✨) instead of image

**3. Click Image Placeholder**
- Modal opens
- "Discovering images..." message appears
- Shows search query: "cycling [product_name]"

**4. Wait for Discovery (15-25 seconds)**
- AI searches for cycling-specific product images
- Images appear in grid when ready

**5. Approve Images**
- Click each good image once to approve (green ring)
- Click bad images twice to reject (red ring)
- Must approve at least 1 image

**6. Set Primary Image**
- Click ⭐ star on your best approved image
- Only 1 image can be primary
- Primary image shows on marketplace cards

**7. Save Selection**
- Click "Save Selection" button
- Rejected/pending images are permanently deleted
- Modal closes
- Product row updates with new image

**8. Verify**
- Product now shows image in products table
- Go to marketplace to see product card with new image

## Benefits

✅ **Faster Workflow**: No need to go to separate Image QA page
✅ **Better Search Results**: "cycling" prefix ensures relevant images
✅ **Immediate Feedback**: See images in context of the product
✅ **Inline Editing**: Approve/reject without leaving products page
✅ **Consistent UX**: Same image selection interface as Image QA
✅ **Automatic Updates**: Primary image updates marketplace cards via trigger

## Validation & Safety

**Required for "Save Selection"**:
- ✅ At least 1 approved image
- ✅ Exactly 1 primary image (must be approved)
- ❌ Rejected/pending images are deleted permanently

**Error Handling**:
- Product must have `canonical_product_id` (shows alert if missing)
- Discovery timeout after 20 polls (40 seconds)
- Shows error message if no images found
- Graceful fallback if API fails

## Files Modified

### Frontend
- ✅ `src/app/products/page.tsx` - Added discovery modal & handlers
- ✅ `src/app/api/admin/images/discover/route.ts` - Added customSearchQuery param

### Backend  
- ✅ `supabase/functions/discover-product-images/index.ts` - Uses custom search query

### Database
- ✅ Uses existing `product_images` table
- ✅ Uses existing `refresh_product_cached_image()` trigger (fixed in previous migration)

## Testing Checklist

- [ ] Click placeholder on product without image
- [ ] Modal opens and shows loading state
- [ ] Images appear after discovery (~20 seconds)
- [ ] Can approve/reject images by clicking
- [ ] Can set primary image with ⭐ star
- [ ] "Save Selection" disabled until ≥1 approved + 1 primary
- [ ] Clicking "Save Selection" closes modal
- [ ] Product row updates with new image
- [ ] Marketplace shows new primary image
- [ ] Non-approved images are deleted from database

## Next Steps

**Potential Enhancements**:
1. Add image download progress indicator
2. Show image dimensions/file size
3. Allow drag-and-drop reordering
4. Bulk discovery for multiple products
5. Search query preview/editing before discovery
6. Image quality scoring

## Deployment

**Edge Function**: ✅ Deployed (`discover-product-images`)
**API Route**: ✅ Updated (deployed with Next.js app)
**Frontend**: ✅ Updated (deployed with Next.js app)
**Database Trigger**: ✅ Already deployed (from previous migration)

## Summary

The products page now supports inline AI image discovery with cycling-specific search queries. Users can click empty image placeholders to trigger image discovery, review results in a modal, approve/reject images, set a primary image, and save their selection—all without leaving the products page. The "cycling" prefix ensures search results are relevant to the cycling industry.

