# Fix Empty For You Page

## Problem
Tracking works, but For You page shows no products.

## Root Cause
Products need scores before they can be recommended. The product_scores table is empty or has no trending scores.

---

## ✅ Quick Fix (2 Steps)

### Step 1: Bootstrap Product Scores

Run this in **Supabase SQL Editor:**

Copy/paste the contents of: **`BOOTSTRAP_RECOMMENDATIONS.sql`**

This will:
- ✅ Initialize scores for all products
- ✅ Add some random scores for testing
- ✅ Calculate trending scores
- ✅ Show you the top trending products

### Step 2: Refresh For You Page

1. Visit: http://localhost:3000/for-you
2. Click the "Refresh" button
3. Products should now appear!

---

## Debug: Check What's Happening

### Check Browser Console

Visit the For You page and open console (F12). You'll see logs like:

```
[For You] Fetching recommendations from: ...
[For You] Response status: 200
[For You] Received data: { success: true, count: 50, ... }
```

If `count: 0`, then no products were found.

### Check Recommendations API Directly

Run in browser console:

```javascript
fetch('/api/recommendations/for-you?limit=10')
  .then(r => r.json())
  .then(data => {
    console.log('Recommendations:', data);
    console.log('Count:', data.recommendations?.length);
    console.log('Meta:', data.meta);
  });
```

### Check Database Has Scored Products

Run in Supabase SQL Editor:

```sql
-- Check if products have scores
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE trending_score > 0) as with_trending_score
FROM product_scores;

-- If with_trending_score is 0, that's the problem!
```

---

## If Still Empty After Bootstrap

### Check 1: Product Scores Exist

```sql
SELECT * FROM product_scores 
WHERE trending_score > 0 
LIMIT 10;
```

**If empty:** Run the BOOTSTRAP script above.

### Check 2: Products Are Active

```sql
SELECT COUNT(*) FROM products WHERE is_active = true;
```

**If 0:** You need products in your database first!

### Check 3: API Response

```javascript
// In browser console
fetch('/api/recommendations/for-you?limit=10')
  .then(r => r.json())
  .then(console.log);
```

Look at the response. If `recommendations: []`, the algorithms aren't finding products.

---

## Manual Test

Try getting trending products manually:

```sql
-- Should return products
SELECT 
  p.id,
  p.description,
  p.price,
  ps.trending_score
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.trending_score > 0
  AND p.is_active = true
ORDER BY ps.trending_score DESC
LIMIT 20;
```

If this returns products, the API should work. If not, run BOOTSTRAP_RECOMMENDATIONS.sql.

---

## Quick Fix Command Sequence

```bash
# 1. Open Supabase SQL Editor
# 2. Run BOOTSTRAP_RECOMMENDATIONS.sql
# 3. Visit For You page
# 4. Click Refresh button
```

That's it! Products should appear.

---

## Verify It's Working

After bootstrap, you should see:

**In Supabase:**
```sql
SELECT COUNT(*) FROM product_scores WHERE trending_score > 0;
-- Should return > 0
```

**On For You page:**
- Grid of products
- "Personalised recommendations..." text
- Refresh button working

**In browser console:**
```
[For You] Received data: { success: true, count: 50, personalized: false }
```

---

## Next Step

Run **`BOOTSTRAP_RECOMMENDATIONS.sql`** in Supabase SQL Editor now!

This will initialize the recommendation system with data so you can see products on the For You page.



