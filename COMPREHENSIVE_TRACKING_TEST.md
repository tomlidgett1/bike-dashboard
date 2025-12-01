# 🧪 Comprehensive Tracking System Test Guide

## Problem Found: Tracking Not Integrated! ✅ FIXED

The tracking hooks existed but weren't being used. I've now integrated them into:

1. ✅ **Product Detail Pages** - Tracks views with dwell time
2. ✅ **Product Cards** - Tracks clicks and likes
3. ✅ **For You Page** - Already has tracking
4. ✅ **Created Test Page** - Interactive testing interface

---

## 🚀 Quick Start Testing (3 Steps)

### Step 1: Apply Database Migrations

```bash
cd bike-dashboard
supabase db push
```

This creates all tables with partitioning and indexes.

### Step 2: Test in Supabase SQL Editor

Open Supabase SQL Editor and run the contents of:
**`QUICK_TEST_TRACKING.sql`**

This will:
- ✅ Verify tables exist
- ✅ Insert test data
- ✅ Test all functions
- ✅ Show current status

### Step 3: Visit Test Page

Navigate to: **http://localhost:3000/test-tracking**

Click "Run All Tests" and watch the results. This tests:
- API health check
- Sending interactions
- Tracking hooks
- Search tracking
- Like/unlike
- Recommendations API

---

## 🔍 Detailed Testing Flow

### Test A: Database Level

**Run in Supabase SQL Editor:**

```sql
-- 1. Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('user_interactions', 'product_scores', 'user_preferences', 'recommendation_cache');

-- 2. Insert a manual test
INSERT INTO user_interactions (
  session_id, product_id, interaction_type, created_at
) 
SELECT gen_random_uuid(), id, 'view', NOW()
FROM products LIMIT 1;

-- 3. Check it was inserted
SELECT * FROM user_interactions ORDER BY created_at DESC LIMIT 5;

-- 4. Check product scores
SELECT * FROM product_scores LIMIT 5;
```

**Expected:** All queries should work without errors.

---

### Test B: API Level

**Open Browser Console (F12) and run:**

```javascript
// 1. Health Check
fetch('/api/tracking').then(r => r.json()).then(console.log);
// Expected: { status: 'ok', service: 'tracking-api', version: '1.0.0' }

// 2. Send Test Interaction
fetch('/api/tracking', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    interactions: [{
      sessionId: crypto.randomUUID(),
      interactionType: 'view',
      productId: 'YOUR_PRODUCT_ID_HERE', // Get from products table
      timestamp: new Date().toISOString()
    }]
  })
}).then(r => r.json()).then(console.log);
// Expected: { success: true, processed: 1 }
```

---

### Test C: Frontend Integration

**1. Visit Product Page:**
- Navigate to any product: `/marketplace/product/[productId]`
- **Check browser console** - should see `[Tracker]` logs
- **Check Network tab** - within 5 seconds, should see POST to `/api/tracking`
- Stay on page for 10+ seconds, then leave - dwell time should be tracked

**2. Like a Product:**
- Click heart icon on any product card
- Check Network tab for tracking request

**3. Search:**
- Use marketplace search
- Type and wait 1 second (debounced)
- Check Network tab for search tracking

**4. Browse Marketplace:**
- Click through several products
- Check Network tab - tracking requests should batch (every 5 seconds)

---

### Test D: Verify Data in Database

**After browsing for 1-2 minutes, run:**

```sql
-- Check tracked interactions
SELECT 
  interaction_type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM user_interactions
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY interaction_type;

-- Check product scores updated
SELECT 
  p.description,
  ps.view_count,
  ps.click_count,
  ps.like_count
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.view_count > 0
ORDER BY ps.view_count DESC
LIMIT 10;

-- Check sessions
SELECT 
  session_id,
  COUNT(*) as interaction_count,
  MIN(created_at) as session_start,
  MAX(created_at) as session_end
FROM user_interactions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY session_id
ORDER BY session_start DESC;
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Module not found: uuid"

**Solution:**
```bash
npm install uuid @types/uuid
```

### Issue 2: No tracking requests in Network tab

**Check:**
1. Are you on a product page or marketplace?
2. Browser console for JavaScript errors?
3. Is the tracking code running? Add `console.log` to verify

**Quick Fix:**
```javascript
// In browser console, manually test:
import('/lib/tracking/interaction-tracker').then(tracker => {
  tracker.trackInteraction('view', { productId: 'test-123' });
});
```

### Issue 3: API returns 401 or 403

**Possible Causes:**
- RLS policies blocking inserts
- Service role key not configured

**Check RLS:**
```sql
-- Disable RLS temporarily for testing
ALTER TABLE user_interactions DISABLE ROW LEVEL SECURITY;

-- Try inserting again, then re-enable:
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
```

### Issue 4: Data in user_interactions but not product_scores

**Solution:** Initialize product scores:
```sql
INSERT INTO product_scores (product_id)
SELECT id FROM products WHERE is_active = true
ON CONFLICT (product_id) DO NOTHING;
```

### Issue 5: Tracking works but recommendations don't

**Steps:**
1. Generate user preferences:
```sql
SELECT update_user_preferences_from_interactions('YOUR_USER_ID'::UUID);
```

2. Calculate scores:
```sql
SELECT calculate_popularity_scores();
```

3. Test recommendations API:
```bash
curl http://localhost:3000/api/recommendations/for-you?limit=10
```

---

## ✅ Success Criteria

**After 5 minutes of browsing, you should have:**

- [ ] 20+ interactions in `user_interactions` table
- [ ] 10+ products with view counts in `product_scores`
- [ ] At least 1 entry in `user_preferences` (if logged in)
- [ ] Network tab shows batched POST requests to `/api/tracking`
- [ ] No console errors related to tracking
- [ ] `/test-tracking` page shows all tests passing
- [ ] `/for-you` page shows recommendations

---

## 📊 Monitoring Dashboard Queries

**Save these for ongoing monitoring:**

```sql
-- Daily interaction stats
SELECT 
  DATE(created_at) as date,
  interaction_type,
  COUNT(*) as count
FROM user_interactions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), interaction_type
ORDER BY date DESC, count DESC;

-- Active users today
SELECT 
  COUNT(DISTINCT user_id) as active_users,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(*) as total_interactions
FROM user_interactions
WHERE created_at > CURRENT_DATE;

-- Top products today
SELECT 
  p.id,
  p.description,
  COUNT(*) as interactions_today
FROM user_interactions ui
JOIN products p ON ui.product_id = p.id
WHERE ui.created_at > CURRENT_DATE
GROUP BY p.id, p.description
ORDER BY interactions_today DESC
LIMIT 20;

-- Tracking performance
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as interactions,
  COUNT(DISTINCT session_id) as sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as auth_users
FROM user_interactions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

---

## 🎯 Next Steps After Testing

Once tracking is confirmed working:

1. **Deploy Edge Function:**
```bash
supabase functions deploy generate-recommendations
```

2. **Set up Cron Job:**
The edge function should run every 15 minutes to pre-generate recommendations.

3. **Monitor Performance:**
- Track API response times
- Monitor database query performance
- Check cache hit rates

4. **Optimize:**
- Add indexes if queries are slow
- Adjust batch size if needed
- Tune cache duration based on usage

---

## 📝 Test Checklist

Use this for comprehensive testing:

### Database Setup
- [ ] Tables created (`user_interactions`, `product_scores`, etc.)
- [ ] Partitions created for `user_interactions`
- [ ] Helper functions exist (check with `\df` in psql)
- [ ] RLS policies configured correctly
- [ ] Indexes created

### API Testing
- [ ] `/api/tracking` GET returns health check
- [ ] `/api/tracking` POST accepts interactions
- [ ] `/api/recommendations/for-you` returns data
- [ ] Rate limiting works (try 100+ requests)
- [ ] Error handling works (send invalid data)

### Frontend Integration
- [ ] Product pages track views automatically
- [ ] Product cards track clicks
- [ ] Like buttons track likes/unlikes
- [ ] Search tracking works with debouncing
- [ ] Dwell time tracked on page leave
- [ ] Session management works (check localStorage)

### Data Verification
- [ ] Interactions appear in database
- [ ] Product scores increment correctly
- [ ] User preferences generate from interactions
- [ ] Recommendation cache populated
- [ ] No orphaned records

### Performance
- [ ] API responds in <100ms (with cache)
- [ ] Tracking batches properly (5s intervals)
- [ ] No memory leaks (check browser dev tools)
- [ ] Database queries use indexes efficiently
- [ ] No N+1 query problems

---

## 🆘 Need Help?

1. **Check the files created:**
   - `QUICK_TEST_TRACKING.sql` - Quick database tests
   - `TEST_RECOMMENDATION_SYSTEM.sql` - Comprehensive tests
   - `/test-tracking` page - Interactive testing

2. **Common commands:**
```bash
# Restart dev server
npm run dev

# Check Supabase logs
supabase logs

# Reset database (CAUTION!)
supabase db reset

# Push migrations
supabase db push
```

3. **Debug mode:**
Open browser console and look for `[Tracker]` prefixed logs for detailed tracking information.

---

**Status:** 🟢 System ready for testing!
**Version:** 1.0.0  
**Last Updated:** Nov 29, 2025

