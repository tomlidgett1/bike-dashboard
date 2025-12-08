# 🚨 Emergency Debug - Tracking Still Failing

## Current Status
RLS policies were fixed, but tracking API still returns 500 Internal Server Error.

## Immediate Steps to Debug

### Step 1: Check Server Logs (MOST IMPORTANT)

Your dev server (npm run dev) should now be printing detailed logs. Check the terminal where `npm run dev` is running and look for lines starting with:
```
[Tracking API] ...
```

These logs will show EXACTLY where the error is happening.

### Step 2: Test with Simple Endpoint

Visit in browser: **http://localhost:3000/api/tracking/test**

Then test with curl:
```bash
curl -X POST http://localhost:3000/api/tracking/test \
  -H "Content-Type: application/json" \
  -d '{
    "interactions": [{
      "sessionId": "test-session-123",
      "interactionType": "view",
      "productId": null,
      "timestamp": "2025-11-29T22:00:00Z"
    }]
  }'
```

This will show detailed error logs.

### Step 3: Test Direct Database Insert

Run in Supabase SQL Editor:
```sql
-- Test insert directly
INSERT INTO user_interactions (
  user_id,
  session_id,
  product_id,
  interaction_type,
  created_at
) VALUES (
  NULL,
  gen_random_uuid(),
  NULL,
  'view',
  NOW()
);

-- Check if it worked
SELECT * FROM user_interactions ORDER BY created_at DESC LIMIT 1;
```

If this works, the problem is in the API code, not the database.

### Step 4: Check for Missing Columns

Run:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_interactions'
ORDER BY ordinal_position;
```

**Expected columns:**
- id (uuid)
- user_id (uuid) - nullable
- session_id (uuid) - not null
- product_id (uuid) - nullable
- interaction_type (text) - not null
- dwell_time_seconds (integer)
- metadata (jsonb)
- created_at (timestamptz)

### Step 5: Try Browser Console Test

Open browser console and run:
```javascript
// Get a real product ID first
fetch('/api/marketplace/products?limit=1')
  .then(r => r.json())
  .then(data => {
    const productId = data.products[0]?.id;
    console.log('Testing with product:', productId);
    
    // Now test tracking
    return fetch('/api/tracking/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interactions: [{
          sessionId: crypto.randomUUID(),
          interactionType: 'view',
          productId: productId,
          timestamp: new Date().toISOString()
        }]
      })
    });
  })
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

## Common Issues & Quick Fixes

### Issue A: "column X does not exist"
**Cause:** Migration didn't create all columns
**Fix:**
```bash
supabase db reset  # WARNING: Deletes all data!
supabase db push
```

Or manually add the column:
```sql
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
```

### Issue B: "cannot insert NULL into column"
**Cause:** Some column is marked NOT NULL but we're sending NULL
**Fix:** Check which column in the error, then:
```sql
ALTER TABLE user_interactions ALTER COLUMN product_id DROP NOT NULL;
```

### Issue C: Partition error
**Error:** "no partition of relation user_interactions found for row"
**Fix:**
```sql
-- Create this month's partition if missing
CREATE TABLE IF NOT EXISTS user_interactions_2025_11 
PARTITION OF user_interactions
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

### Issue D: Server keeps using old code
**Fix:**
```bash
# Stop dev server (Ctrl+C)
rm -rf .next
npm run dev
```

## Debug Checklist

Run these in order and note which one fails:

- [ ] Debug endpoint health check works: `curl http://localhost:3000/api/tracking/debug`
- [ ] Test endpoint GET works: `curl http://localhost:3000/api/tracking/test`
- [ ] Direct SQL insert works: Run INSERT query above
- [ ] Test endpoint POST works: Run curl command above
- [ ] Browser console test works: Run JavaScript above
- [ ] Real tracking works: Click a product and check Network tab

## What to Share

If still broken, share:
1. **Server logs** - Lines with `[Tracking API]` or `[Test Tracking]`
2. **Browser error** - Exact error from console
3. **Debug endpoint output** - http://localhost:3000/api/tracking/debug
4. **SQL test result** - Did direct INSERT work?

## Nuclear Option

If nothing works, let's rebuild from scratch:
```bash
# Backup your data first!
supabase db dump -f backup.sql

# Reset everything
supabase db reset

# Reapply migrations
supabase db push

# Verify
curl http://localhost:3000/api/tracking/debug
```

---

**The server logs are KEY.** Check the terminal running `npm run dev` for `[Tracking API]` messages!





