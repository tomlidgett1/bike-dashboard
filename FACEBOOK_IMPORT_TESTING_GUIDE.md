# Facebook Marketplace Import - Testing Guide

## Prerequisites

Before testing the Facebook Marketplace import feature, ensure you have:

1. **Apify Account & API Token**
   - Sign up at https://apify.com
   - Get your API token from Account Settings → Integrations
   - Add to environment: `APIFY_API_TOKEN=your_token_here`

2. **Supabase Configuration**
   - Ensure Edge Function is deployed: `scrape-facebook-listing`
   - Verify `listing-images` storage bucket exists
   - Verify database migration has been applied (facebook_source_url column)

3. **Test Facebook Marketplace Listings**
   - Find public Facebook Marketplace listings for bikes, parts, or apparel
   - Ensure they have multiple images, clear titles, and prices
   - Copy the full URL (e.g., `https://www.facebook.com/marketplace/item/123456789`)

## Deployment Steps

### 1. Deploy Supabase Edge Function

```bash
cd bike-dashboard
supabase functions deploy scrape-facebook-listing
```

### 2. Apply Database Migration

```bash
supabase db push
```

Verify the migration:
```sql
-- Check if facebook_source_url column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name = 'facebook_source_url';

-- Check if listing_source constraint includes 'facebook_import'
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'products_listing_source_check';
```

### 3. Configure Environment Variables

In your `.env.local` file:
```bash
# Apify API
APIFY_API_TOKEN=your_apify_api_token_here

# Supabase (should already exist)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Testing Scenarios

### Test 1: Basic Import Flow

**Steps:**
1. Navigate to `/marketplace/sell`
2. Click "Import from Facebook"
3. Paste a valid Facebook Marketplace URL
4. Click "Import Listing"
5. Wait for scraping (10-30 seconds)
6. Verify data preview shows:
   - All images loaded
   - Title extracted correctly
   - Price displayed
   - Description present
   - Condition mapped (if available)
   - Location shown
7. Click "Continue to Listing"
8. Verify form is pre-filled with imported data
9. Complete remaining fields and publish

**Expected Result:** Listing created with `listing_source = 'facebook_import'` and `facebook_source_url` populated.

### Test 2: Invalid URL Handling

**Test URLs:**
- `https://google.com` (not Facebook)
- `https://facebook.com/` (not a marketplace item)
- `https://facebook.com/marketplace/category/bikes` (not a specific item)

**Expected Result:** Error message displayed: "Invalid Facebook Marketplace URL"

### Test 3: Private/Deleted Listing

**Steps:**
1. Use a URL to a listing that has been deleted or is private
2. Attempt import

**Expected Result:** Error message: "Failed to scrape listing. The listing may be private or no longer available."

### Test 4: Image Processing

**Steps:**
1. Import a listing with 5+ images
2. Monitor progress bar during image upload
3. Verify all images are uploaded to Supabase Storage
4. Check that first image is marked as primary
5. Verify images display in form preview

**Expected Result:** All images successfully downloaded from Facebook CDN and re-hosted in Supabase Storage under `listing-images/[user_id]/`.

### Test 5: Data Mapping Accuracy

**Test with different item types:**

**Bike Listing:**
- URL with "bike", "bicycle", "mountain bike" in title
- Expected: `itemType = 'bike'`, `marketplace_category = 'Bicycles'`
- Verify brand detection (e.g., "Giant", "Trek", "Specialized")
- Verify year extraction (e.g., "2020 Trek" → `modelYear = '2020'`)

**Parts Listing:**
- URL with "chainring", "derailleur", "wheels" in title
- Expected: `itemType = 'part'`, `marketplace_category = 'Parts'`

**Apparel Listing:**
- URL with "jersey", "helmet", "shoes" in title
- Expected: `itemType = 'apparel'`, `marketplace_category = 'Apparel'`

### Test 6: Condition Mapping

**Test different Facebook condition values:**
- "New" → `conditionRating = 'New'`
- "Like New" → `conditionRating = 'Like New'`
- "Used - Good" → `conditionRating = 'Good'`
- "Used - Fair" → `conditionRating = 'Fair'`

### Test 7: Currency Conversion

**Test listings in different currencies:**
- USD listing: Verify conversion to AUD (multiply by ~1.52)
- EUR listing: Verify conversion to AUD (multiply by ~1.65)
- AUD listing: No conversion needed

**Note:** Current implementation uses simplified static exchange rates. For production, integrate a real-time currency API (e.g., exchangerate-api.com).

### Test 8: Error Recovery

**Steps:**
1. Start import
2. If scraping fails, click "Try Again"
3. Verify can retry with same or different URL
4. Click "Use Manual Entry"
5. Verify switches to manual form

### Test 9: Listing Retrieval

**Steps:**
1. Create listing via Facebook import
2. Navigate to My Listings page
3. Verify imported listing appears
4. Check that `facebook_source_url` is displayed/tracked

### Test 10: Edge Function Timeout

**Steps:**
1. Monitor Supabase Edge Function logs
2. Import a listing
3. Verify function completes within 120 seconds
4. Check for any timeout errors

## Common Issues & Solutions

### Issue: "Scraping service not configured"
**Solution:** Verify `APIFY_API_TOKEN` is set in Supabase Edge Function secrets:
```bash
supabase secrets set APIFY_API_TOKEN=your_token
```

### Issue: "Failed to upload image"
**Solution:** 
- Check Supabase Storage bucket `listing-images` exists
- Verify RLS policies allow authenticated users to upload
- Check bucket is public for reads

### Issue: "Authentication required to upload images"
**Solution:** Ensure user is logged in before accessing import flow

### Issue: Images not loading in preview
**Solution:** 
- Verify Facebook image URLs are accessible
- Check CORS settings in Supabase Storage
- Ensure public URL generation is working

### Issue: Apify rate limit reached
**Solution:** 
- Check Apify account usage
- Consider implementing queue system for high-volume imports
- Add retry logic with exponential backoff

## Manual Testing Checklist

- [ ] Deploy Edge Function
- [ ] Apply database migration
- [ ] Configure API credentials
- [ ] Test valid URL import (bike)
- [ ] Test valid URL import (part)
- [ ] Test valid URL import (apparel)
- [ ] Test invalid URL handling
- [ ] Test deleted/private listing
- [ ] Test image processing (5+ images)
- [ ] Test brand detection
- [ ] Test year extraction
- [ ] Test condition mapping
- [ ] Test currency conversion (if applicable)
- [ ] Test error recovery flow
- [ ] Test listing appears in My Listings
- [ ] Verify facebook_source_url saved to database
- [ ] Test on mobile device
- [ ] Test switching between import methods

## Performance Benchmarks

**Target Metrics:**
- Scraping time: < 30 seconds
- Image processing: < 5 seconds per image
- Total import time: < 60 seconds for 5-image listing
- Success rate: > 90% for public listings

## Production Considerations

1. **Rate Limiting:** Implement user-level rate limits (e.g., 10 imports per hour)
2. **Cost Monitoring:** Track Apify API usage and costs
3. **Error Logging:** Set up Sentry or similar for error tracking
4. **Currency API:** Replace static exchange rates with real-time API
5. **Caching:** Consider caching scraped data for 24 hours to prevent duplicate scrapes
6. **Legal:** Add terms of service noting Facebook import is for personal use
7. **Duplicate Detection:** Check if facebook_source_url already exists before importing

## API Costs

**Apify Pricing:**
- Free tier: $5 credit (≈50 scrapes)
- Pay-as-you-go: $0.10 per scrape
- Monthly plans start at $49/month (≈500 scrapes)

**Recommendation:** Start with free tier for testing, then monthly plan for production.





