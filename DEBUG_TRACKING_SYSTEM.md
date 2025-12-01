# Debug Tracking System - Step by Step Guide

## Step 1: Verify Database Tables Exist

Run this in Supabase SQL Editor:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('user_interactions', 'user_preferences', 'product_scores', 'recommendation_cache');

-- Check user_interactions structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_interactions'
ORDER BY ordinal_position;

-- Check if any data exists
SELECT COUNT(*) as interaction_count FROM user_interactions;
SELECT COUNT(*) as score_count FROM product_scores;
```

**Expected:** All 4 tables should exist. If not, run `supabase db push`.

---

## Step 2: Test Tracking API Directly

Open your browser console and run:

```javascript
// Test 1: Health check
fetch('/api/tracking')
  .then(r => r.json())
  .then(console.log);

// Expected: { status: 'ok', service: 'tracking-api', version: '1.0.0' }

// Test 2: Send a test interaction
fetch('/api/tracking', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    interactions: [{
      sessionId: crypto.randomUUID(),
      interactionType: 'view',
      productId: 'PASTE_A_REAL_PRODUCT_ID_HERE',
      timestamp: new Date().toISOString(),
      metadata: { test: true }
    }]
  })
})
.then(r => r.json())
.then(console.log);

// Expected: { success: true, processed: 1 }
```

---

## Step 3: Check Browser Console for Errors

1. Open DevTools (F12)
2. Go to Console tab
3. Look for errors starting with `[Tracker]`
4. Check Network tab for failed `/api/tracking` requests

---

## Step 4: Verify Product Pages Use Tracking

The tracking hooks need to be integrated into product pages. Let me check...

---

## Step 5: Manual Database Test

Run in Supabase SQL Editor:

```sql
-- Insert a test interaction manually
INSERT INTO user_interactions (
  user_id,
  session_id,
  product_id,
  interaction_type,
  dwell_time_seconds,
  created_at
)
SELECT 
  auth.uid(),
  gen_random_uuid(),
  id,
  'view',
  30,
  NOW()
FROM products
WHERE is_active = true
LIMIT 1;

-- Check if it was inserted
SELECT * FROM user_interactions ORDER BY created_at DESC LIMIT 5;

-- Check product scores
SELECT * FROM product_scores LIMIT 5;
```

---

## Step 6: Test RLS Policies

```sql
-- Check if RLS is blocking inserts
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'user_interactions';

-- Try inserting as service role
SET ROLE service_role;
INSERT INTO user_interactions (
  session_id,
  product_id,
  interaction_type,
  created_at
)
SELECT 
  gen_random_uuid(),
  id,
  'view',
  NOW()
FROM products
LIMIT 1;
RESET ROLE;
```

---

## Common Issues & Fixes

### Issue 1: Tables Don't Exist
**Fix:** Run migrations
```bash
cd bike-dashboard
supabase db push
```

### Issue 2: Tracking Not Integrated in Product Pages
**Fix:** Product pages need to import and use the tracking hooks

### Issue 3: RLS Blocking Inserts
**Fix:** Check if service role policy exists and user_id can be NULL

### Issue 4: JavaScript Errors
**Check:** Browser console for errors

### Issue 5: UUID Package Not Installed
**Fix:**
```bash
npm install uuid @types/uuid
```

---

## Quick Diagnostic Query

Run this to see the full system status:

```sql
-- System Status Check
SELECT 
  'user_interactions' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_entry
FROM user_interactions
UNION ALL
SELECT 
  'product_scores',
  COUNT(*),
  MAX(updated_at)
FROM product_scores
UNION ALL
SELECT 
  'user_preferences',
  COUNT(*),
  MAX(updated_at)
FROM user_preferences
UNION ALL
SELECT 
  'recommendation_cache',
  COUNT(*),
  MAX(created_at)
FROM recommendation_cache;
```

---

## Next Steps After Running Tests

Report back with:
1. Do the tables exist? (Step 1)
2. Does the API health check work? (Step 2)
3. Does the POST request work? (Step 2)
4. Any console errors? (Step 3)
5. Can you insert manually? (Step 5)

This will help me identify exactly where the issue is!

