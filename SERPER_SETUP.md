# 🎯 Serper API Setup (Google Images Access)

## Why Serper?

**Problem**: OpenAI finds image URLs, but they're often broken/inaccessible (404 errors)

**Solution**: Serper API gives you direct access to **Google Image Search results** - URLs that Google has already verified and indexed.

## Benefits

✅ **Real, working URLs** - Google has already verified these images exist
✅ **High quality** - Google ranks the best images first
✅ **Fast** - Direct API access, no web scraping
✅ **FREE tier** - 2,500 searches/month (perfect for testing)

## Setup (Takes 2 Minutes)

### Step 1: Get FREE API Key

1. Go to: **https://serper.dev**
2. Click "Sign Up" (use Google/GitHub)
3. Go to Dashboard → Copy your API key
4. Free tier: **2,500 searches/month**

### Step 2: Add to Supabase

```bash
cd /Users/user/Desktop/Bike/bike-dashboard

# Add Serper API key
supabase secrets set SERPER_API_KEY=your-serper-key-here

# Verify both keys are set
supabase secrets list
```

You should see:
- ✅ `OPENAI_API_KEY`
- ✅ `SERPER_API_KEY`

### Step 3: Already Done! 🎉

The function is already deployed and will automatically use Serper if the key is set.

## How It Works Now

```
┌─────────────────────────────────────────────────────┐
│           Priority 1: Serper (Google Images)        │
│                                                     │
│  1. Query Google Images via Serper API             │
│  2. Get 20 verified, working image URLs            │
│  3. Filter: size >400px, no sketchy domains        │
│  4. GPT-4 curates best 5 for e-commerce            │
│  5. Download & upload to Supabase                  │
│                                                     │
│           Fallback: OpenAI Web Search               │
│           (If Serper key not set)                   │
└─────────────────────────────────────────────────────┘
```

## What You'll See in Logs

**With Serper (BEST):**
```
🔍 [IMAGE SEARCH] Query: "Bell Pit Helmet product"
🌐 [SERPER] Using Google Image Search for guaranteed working URLs...
✅ [SERPER] Found 20 images from Google
📊 [SERPER] 15 valid images after filtering
🤖 [GPT-4] Curating best 5 images from 15 candidates...
✅ [GPT-4] Curated 5 images
✅ [SERPER] Returning 5 images
📥 [AI DISCOVERY] Processing image 1/5
✅ [AI DISCOVERY] Uploaded successfully
```

**Without Serper (Fallback):**
```
⚠️  [SERPER] SERPER_API_KEY not set
💡 [SERPER] Get free API key at https://serper.dev
🤖 [OPENAI] Using Responses API with web search...
```

## Cost Estimate

| Usage | Serper Cost | OpenAI Cost (curation) | Total |
|-------|-------------|------------------------|-------|
| 1,000 products | $0 (free tier) | ~$1 | ~$1/month |
| 2,500 products | $0 (free tier) | ~$2.50 | ~$2.50/month |
| 10,000 products | ~$30 | ~$10 | ~$40/month |

**For most use cases, you'll stay within the FREE tier!**

## Test It Now

1. Add your Serper API key (see Step 2 above)
2. Go to **Products** page
3. Click **"Images"** on any product
4. Click **"✨ Find Images with AI"**
5. Check Supabase Functions logs - you should see:
   - `🌐 [SERPER] Using Google Image Search...`
   - `✅ [SERPER] Found X images from Google`
   - All downloads should succeed now!

## Troubleshooting

### "SERPER_API_KEY not set"
```bash
supabase secrets set SERPER_API_KEY=your-key-here
```

### Still getting 404 errors?
- Check logs to confirm Serper is being used
- Some domains may still block downloads (Pinterest, etc.)
- The system will skip failed downloads and move to next image

### No images found?
- Try more specific product names
- Very niche products may have limited images
- Check if product name is correct

## What About OpenAI Responses API?

- Still used as **fallback** if Serper key not set
- Also used by GPT-4 to **curate/select** the best images from Google results
- Both APIs work together for best results!

---

**TL;DR**: Add Serper API key to get real, working Google Images instead of broken URLs. Takes 2 minutes, free tier is generous.








