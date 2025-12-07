# Fix Serper API 403 Unauthorized Error

## The Problem

Error: `403 - {"message":"Unauthorized.","statusCode":403}`

This means the Serper API key is either:
1. Not set in Supabase secrets
2. Set incorrectly
3. Invalid/expired

## Fix Steps

### Step 1: Verify Your Serper API Key

1. Go to: **https://serper.dev**
2. Log in to your account
3. Go to **Dashboard** → **API Key**
4. Copy your API key (should look like: `a1b2c3d4e5f6...`)

### Step 2: Check Current Supabase Secrets

```bash
cd /Users/user/Desktop/Bike/bike-dashboard

# List all secrets (won't show values, just names)
supabase secrets list
```

You should see:
- `OPENAI_API_KEY`
- `SERPER_API_KEY` ← Check if this exists

### Step 3: Set/Update the Serper Key

```bash
# Set the key (replace with your actual key from serper.dev)
supabase secrets set SERPER_API_KEY=your-actual-key-here

# Example (don't use this fake key):
# supabase secrets set SERPER_API_KEY=abc123def456ghi789jkl012mno345pqr678
```

### Step 4: Verify It's Set

```bash
supabase secrets list
```

Should now show `SERPER_API_KEY` in the list.

### Step 5: Test the Function

The function will automatically use the new key. No need to redeploy.

Go to Products → Click "Images" → Click "✨ Find Images with AI"

Check logs - you should now see:
```
🌐 [SERPER] Using Google Image Search for guaranteed working URLs...
✅ [SERPER] Found 20 images from Google
```

Instead of:
```
❌ [SERPER] API error: 403
```

## Common Mistakes

### ❌ Wrong: Setting as environment variable in terminal
```bash
# This WON'T work - it's only for your local shell
export SERPER_API_KEY=abc123
```

### ✅ Correct: Setting as Supabase secret
```bash
# This WILL work - persists in Supabase
supabase secrets set SERPER_API_KEY=abc123
```

### ❌ Wrong: Including quotes
```bash
# Don't wrap in quotes
supabase secrets set SERPER_API_KEY="abc123"
```

### ✅ Correct: No quotes
```bash
# Just the raw key
supabase secrets set SERPER_API_KEY=abc123
```

## If You Don't Have a Serper Account Yet

1. Go to: https://serper.dev
2. Click "Sign Up"
3. Use Google or GitHub to sign in
4. Free tier: 2,500 searches/month
5. Copy your API key from the Dashboard

## Alternative: Use OpenAI Fallback

If you don't want to use Serper, the system will automatically fall back to OpenAI Responses API (but with the broken URL issue you experienced).

To force OpenAI fallback, just don't set `SERPER_API_KEY` at all.

## Troubleshooting

### Still getting 403?
- Double-check the API key is correct (copy-paste from serper.dev)
- Make sure you didn't include any extra spaces or quotes
- Try generating a new API key in Serper dashboard

### "SERPER_API_KEY not set"
- Run: `supabase secrets set SERPER_API_KEY=your-key`
- Don't redeploy, just test again

### Function still uses old key?
- Supabase Edge Functions pick up new secrets immediately
- No need to redeploy
- Just try the function again








