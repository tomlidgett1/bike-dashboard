# Fix Tracking API Error - Step by Step

## Error: "Internal Server Error" from tracking API

This means the database tables likely don't exist yet, or there's an RLS/permissions issue.

---

## 🔧 **Solution: Apply Database Migrations**

### Step 1: Check if Migrations Applied

Open Supabase SQL Editor and run:

```sql
-- Check if recommendation tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('user_interactions', 'user_preferences', 'product_scores', 'recommendation_cache');
```

**Expected:** Should return 4 rows. If not, continue to Step 2.

---

### Step 2: Apply Migrations

```bash
cd bike-dashboard
supabase db push
```

**Wait for:** "Finished supabase db push"

If you see errors like "relation already exists", that's OK - it means some tables already exist.

---

### Step 3: Verify Tables Created

Run in Supabase SQL Editor:

```sql
-- Check table structure
\d user_interactions

-- Or use:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_interactions';
```

---

### Step 4: Check RLS Policies

```sql
-- Check if policies exist for user_interactions
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'user_interactions';
```

**Expected:** Should show policies like:
- "Users can view own interactions"
- "Users can insert own interactions" 
- "Service role full access"

---

### Step 5: Test Manual Insert

```sql
-- Try inserting directly
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
WHERE is_active = true 
LIMIT 1;

-- Check if it worked
SELECT COUNT(*) FROM user_interactions;
```

If this **fails**, check the error message for clues.

---

### Step 6: Fix Common Issues

#### Issue A: "relation does not exist"

**Solution:** Migrations not applied. Run:
```bash
supabase db push
```

#### Issue B: "permission denied for table"

**Solution:** RLS blocking. Temporarily disable for testing:
```sql
ALTER TABLE user_interactions DISABLE ROW LEVEL SECURITY;
```

Then try tracking again. If it works, the issue is RLS policies.

#### Issue C: "violates foreign key constraint"

**Solution:** product_id doesn't exist. Either:
1. Use a real product ID from your products table
2. Allow NULL product_ids temporarily:

```sql
ALTER TABLE user_interactions ALTER COLUMN product_id DROP NOT NULL;
```

#### Issue D: Partition doesn't exist

**Error:** "no partition of relation user_interactions found"

**Solution:** Create the current month's partition:

```sql
-- Create this month's partition
CREATE TABLE IF NOT EXISTS user_interactions_2025_11 
PARTITION OF user_interactions
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

---

### Step 7: Re-test Tracking

1. Restart your dev server:
```bash
npm run dev
```

2. Visit: http://localhost:3000/test-tracking

3. Click "Run All Tests"

4. Check browser console - should now see success messages

---

## 🔍 Advanced Debugging

### Check Server Logs

If you have access to Next.js server logs:

```bash
# Watch dev server output
npm run dev

# In another terminal, check logs
tail -f .next/trace
```

### Check Supabase Logs

In Supabase Dashboard:
1. Go to Database → Logs
2. Look for recent errors
3. Check timing of errors vs. tracking attempts

### Enable Verbose Tracking Logs

In browser console:

```javascript
// Enable verbose logging
localStorage.setItem('debug_tracking', 'true');

// Then trigger tracking
location.reload();
```

---

## ✅ **Quick Fix Command Sequence**

If you want to just fix everything quickly:

```bash
# 1. Apply migrations
cd bike-dashboard
supabase db push

# 2. Verify in SQL Editor
# Run: SELECT * FROM user_interactions LIMIT 1;

# 3. If partitions missing, run this in SQL Editor:
```

```sql
-- Create current and next month partitions
CREATE TABLE IF NOT EXISTS user_interactions_2025_11 
PARTITION OF user_interactions
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS user_interactions_2025_12 
PARTITION OF user_interactions
FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS user_interactions_2026_01 
PARTITION OF user_interactions
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

```bash
# 4. Restart dev server
npm run dev

# 5. Test
# Visit: http://localhost:3000/test-tracking
```

---

## 📊 **Verify It's Fixed**

Run in Supabase SQL Editor:

```sql
-- Should return data after browsing
SELECT 
  COUNT(*) as total_interactions,
  COUNT(DISTINCT session_id) as unique_sessions,
  MAX(created_at) as latest_interaction
FROM user_interactions;
```

**Expected:** Numbers greater than 0 after you browse the marketplace.

---

## 🆘 Still Having Issues?

1. **Check error in browser console** - exact error message
2. **Check Supabase dashboard** - Database → Logs
3. **Run test page** - http://localhost:3000/test-tracking
4. **Share the error** - Copy full error from console

The most common issue is simply that migrations haven't been applied. Running `supabase db push` fixes 90% of tracking errors.

---

**Next:** Once tracking works, check the `/for-you` page - it should show recommendations!










