# 🔍 AI Image Discovery Setup

## The Problem with Chat GPT API

**Standard OpenAI Chat Completions API CANNOT browse the internet.**

When you ask GPT-4 to "find images", it will:
- ❌ Hallucinate fake URLs like `example.com`
- ❌ Make up non-existent image paths
- ❌ Return 404 errors on download

This is why you saw "5 images found, 0 downloaded" - the URLs were all fake!

## The Solution: Real Image Search

I've updated the system to use **Serper API** (Google Image Search) to find REAL images, then GPT-4 to intelligently select the best ones.

## Setup Steps

### Step 1: Get Serper API Key (FREE)

1. Go to: https://serper.dev
2. Sign up (Google/GitHub login)
3. Get your API key from Dashboard
4. **Free tier**: 2,500 searches/month (plenty for testing!)

### Step 2: Add to Supabase Secrets

```bash
cd /Users/user/Desktop/Bike/bike-dashboard

# Add Serper API key
supabase secrets set SERPER_API_KEY=your-serper-key-here

# Confirm both keys are set
supabase secrets list
```

You should see:
- `OPENAI_API_KEY` ✓
- `SERPER_API_KEY` ✓

### Step 3: Deploy Updated Function

```bash
supabase functions deploy discover-product-images
```

### Step 4: Test It!

1. Go to Products page
2. Click "Images" on any product
3. Click "✨ Find Images with AI"
4. Wait ~30 seconds
5. Watch the logs - you should see:
   - `🔍 [IMAGE SEARCH] Query: "Product Name..."`
   - `🌐 [SERPER] Using Serper API for real Google Image Search...`
   - `✅ [SERPER] Found X images from Google`
   - `✅ [GPT-4] Selected X images`

## How It Works Now

```
┌──────────────────────────────────────────────────────────┐
│                    New Image Discovery Flow               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Product added to canonical_products                  │
│              ↓                                           │
│  2. Serper API → Real Google Image Search               │
│              ↓                                           │
│  3. Filter: Min 300px, valid URLs, reputable sources    │
│              ↓                                           │
│  4. GPT-4 → Curate best images for e-commerce           │
│              ↓                                           │
│  5. Download REAL images from REAL URLs                 │
│              ↓                                           │
│  6. Upload to Supabase Storage                          │
│              ↓                                           │
│  7. Create product_images records                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Fallback: DuckDuckGo

If SERPER_API_KEY is not set, the system will try DuckDuckGo Image Search as a fallback (no API key needed, but less reliable).

## Cost Estimate

| Service | Free Tier | Cost After |
|---------|-----------|------------|
| Serper | 2,500/month | $50/10K searches |
| OpenAI (curation) | - | ~$0.001/product |

For 1,000 products/month: **~$0** (within free tier)

## Verify It's Working

Check Supabase Functions logs for these messages:

**Good (Real Search):**
```
🔍 [IMAGE SEARCH] Query: "Bell Pit Helmet bicycle helmets"
🌐 [SERPER] Using Serper API for real Google Image Search...
✅ [SERPER] Found 20 images from Google
📊 [SERPER] 15 valid images after filtering
🤖 [GPT-4] Curating 15 images for "Bell Pit Helmet"...
✅ [GPT-4] Selected 5 images
✅ [AI DISCOVERY] Uploaded successfully
```

**Bad (Hallucinated - OLD BEHAVIOR):**
```
🤖 [OPENAI] Searching for images...
📊 [OPENAI] Found 5 images
❌ [AI DISCOVERY] Download failed: HTTP 404: Not Found
```

## Troubleshooting

### "SERPER_API_KEY not set"
Run: `supabase secrets set SERPER_API_KEY=your-key`

### "0 images found"
- Try a more specific product name
- Check if product exists (very niche products may not have images)

### "All downloads failed"
- Images may be behind CDN restrictions
- Some sites block bot access
- The system will skip and try next image

## Quick Test Command

```bash
# Test the function directly
curl -X POST \
  https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/discover-product-images \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"canonicalProductId": "YOUR_CANONICAL_PRODUCT_ID"}'
```












