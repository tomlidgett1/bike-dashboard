# 🔍 Check Server Logs - Critical Debug Step

## The Problem
Test page works, but real product views fail. This means something different about the product page data is causing the error.

## ⚡ CRITICAL: Check Your Dev Server Terminal NOW

Look at the terminal where `npm run dev` is running.

You should now see detailed logs when you view a product:

```
[Tracking API] POST request received at...
[Tracking API] Parsing request body...
[Tracking API] Received X interactions
[Tracking API] Sample interaction: { ... }
[Tracking API] Inserting X interactions...
❌ [Tracking API] INSERT FAILED
[Tracking API] Error code: XXXXX
[Tracking API] Error message: ACTUAL ERROR HERE
```

**The error message in the server logs will tell us exactly what's breaking!**

---

## What to Look For

### If logs show "partition" error:
```
no partition of relation user_interactions found
```
**Fix:** Need to create partition for current month

### If logs show "foreign key" error:
```
violates foreign key constraint
```
**Fix:** Product ID doesn't exist in products table

### If logs show "column" error:
```
column "xxx" does not exist
```
**Fix:** Migration didn't create all columns

### If NO LOGS appear at all:
The server might not be restarting properly. Try:
```bash
# Stop server (Ctrl+C)
rm -rf .next
npm run dev
```

---

## Quick Test

Run this in browser console to see the FULL error:
```javascript
// Get a real product ID first
fetch('/api/marketplace/products?limit=1')
  .then(r => r.json())
  .then(data => {
    const productId = data.products[0]?.id;
    console.log('Using product ID:', productId);
    
    // Test tracking with real product ID
    return fetch('/api/tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interactions: [{
          sessionId: crypto.randomUUID(),
          interactionType: 'view',
          productId: productId,  // Real product ID
          timestamp: new Date().toISOString(),
          dwellTimeSeconds: 10,
          metadata: { test: true }
        }]
      })
    });
  })
  .then(async r => {
    if (!r.ok) {
      const error = await r.json();
      console.error('❌ FAILED:', error);
      return;
    }
    const data = await r.json();
    console.log('✅ SUCCESS:', data);
  });
```

This will show the EXACT error response.

---

## Emergency Fix

If you just want tracking to work NOW without debugging:

**Option 1: Skip product_id validation**
```javascript
// In interaction-tracker.ts, modify trackInteraction to not send product_id
// But this defeats the purpose of tracking...
```

**Option 2: Rebuild tables**
```bash
supabase db reset  # ⚠️ DELETES ALL DATA!
supabase db push
```

---

## What I Need

Please share:
1. **Server logs** - Copy all lines with `[Tracking API]` when you view a product
2. **Browser console error** - Run the test code above
3. **Network response** - Check Network tab → /api/tracking → Response

Without seeing the actual error message, I can't help further!








