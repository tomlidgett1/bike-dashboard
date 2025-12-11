# 🔍 Diagnose & Fix Auto Image Discovery

## The System Has 2 Parts

### Part 1: Auto-Queue (Trigger)
✅ **Already working** - When you add a product to `canonical_products`, it's automatically added to the `ai_image_discovery_queue`

### Part 2: Auto-Process (pg_cron)
❌ **Probably not set up** - A cron job needs to actually process the queue every 5 minutes

---

## Step 1: Run Diagnostic

Open **Supabase SQL Editor** and run `CHECK_AUTO_DISCOVERY.sql`

This will show you:
- ✅ or ❌ Queue table exists
- ✅ or ❌ Trigger exists  
- ✅ or ❌ pg_cron configured
- How many items are pending in the queue

---

## Step 2: Check What's Missing

### If "Queue Table" = ❌ MISSING

Run the migration:
```bash
cd /Users/user/Desktop/Bike/bike-dashboard
supabase db push
```

### If "Auto-Queue Trigger" = ❌ MISSING

Run this in Supabase SQL Editor:
```sql
-- Copy ALL SQL from: 
-- supabase/migrations/20251128022736_create_ai_image_discovery_queue.sql
```

### If "Cron Job" = ⚠️ NOT CONFIGURED

**This is probably your issue!** The queue is filling up but nothing is processing it.

---

## Step 3: Fix pg_cron (Process the Queue Automatically)

### A. Check if pg_cron extension exists

Run in Supabase SQL Editor:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

**If empty**: pg_cron isn't available (you may need to contact Supabase support or upgrade plan)

**If returns 1 row**: pg_cron is available! Continue to Step B.

### B. Get Your Service Role Key

1. Go to: **Supabase Dashboard → Settings → API**
2. Copy the `service_role` key (NOT the anon key!)
3. Keep it safe - you'll need it in the next step

### C. Schedule the Queue Processor

Run this in Supabase SQL Editor (replace `YOUR_SERVICE_KEY`):

```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing cron job if any
SELECT cron.unschedule('process-ai-image-discovery');

-- Schedule queue processor (every 5 minutes)
SELECT cron.schedule(
  'process-ai-image-discovery',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/process-image-discovery-queue',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY_HERE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- Verify it's scheduled
SELECT * FROM cron.job WHERE jobname = 'process-ai-image-discovery';
```

**Expected result**: 1 row showing the cron job

### D. Verify It's Working

Wait 5 minutes, then check the queue:

```sql
SELECT 
  status,
  COUNT(*) as count
FROM ai_image_discovery_queue
GROUP BY status;
```

You should see items moving from `pending` → `processing` → `completed`!

---

## Step 4: Queue Existing Products

If you have existing products without images, queue them:

```sql
INSERT INTO ai_image_discovery_queue (
  canonical_product_id,
  product_name,
  upc,
  category,
  manufacturer,
  priority
)
SELECT 
  cp.id,
  cp.normalized_name,
  cp.upc,
  cp.category,
  cp.manufacturer,
  CASE 
    WHEN cp.upc NOT LIKE 'TEMP-%' THEN 10
    ELSE 5
  END as priority
FROM canonical_products cp
WHERE NOT EXISTS (
  SELECT 1 FROM product_images pi WHERE pi.canonical_product_id = cp.id
)
ON CONFLICT (canonical_product_id) DO NOTHING;

-- Check how many were queued
SELECT COUNT(*) FROM ai_image_discovery_queue WHERE status = 'pending';
```

---

## Alternative: Manual Processing (If pg_cron Not Available)

If pg_cron isn't available on your Supabase plan, you can manually trigger queue processing:

### Option A: Manual API Call

```bash
cd /Users/user/Desktop/Bike/bike-dashboard
./FORCE_RUN_AI_DISCOVERY.sh
```

(Edit the script first to add your service key)

### Option B: Curl Command

```bash
curl -X POST \
  https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/process-image-discovery-queue \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Option C: External Cron (Cron-job.org, GitHub Actions, etc.)

Set up an external cron service to hit your Edge Function every 5 minutes.

---

## Expected Behavior Once Fixed

1. **User adds product** → Syncs from Lightspeed
2. **Trigger fires** → Product added to `ai_image_discovery_queue` (status: `pending`)
3. **pg_cron runs** (every 5 min) → Calls `process-image-discovery-queue`
4. **Queue processor** → Picks up pending items, calls `discover-product-images`
5. **AI searches** → Finds images via Serper/OpenAI
6. **Downloads & uploads** → Images saved to Supabase Storage
7. **Queue updated** → Status changed to `completed`
8. **User sees images** → Product now has images on marketplace!

---

## Quick Diagnostic Checklist

Run these queries to verify everything:

```sql
-- 1. Trigger exists?
SELECT COUNT(*) FROM information_schema.triggers 
WHERE trigger_name = 'trigger_auto_queue_ai_discovery';
-- Expected: 1

-- 2. Items in queue?
SELECT COUNT(*) FROM ai_image_discovery_queue WHERE status = 'pending';
-- Expected: > 0

-- 3. pg_cron configured?
SELECT COUNT(*) FROM cron.job WHERE jobname = 'process-ai-image-discovery';
-- Expected: 1

-- 4. Products without images?
SELECT COUNT(*) FROM canonical_products cp
WHERE NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.canonical_product_id = cp.id);
-- Expected: Should match queue pending count

-- 5. Recent cron runs?
SELECT status, return_message, start_time 
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-ai-image-discovery')
ORDER BY start_time DESC LIMIT 5;
-- Expected: Recent runs with status = 'succeeded'
```

---

## TL;DR

**Most likely issue**: pg_cron not configured

**Quick fix**: Run Step 3C above to schedule the queue processor

**Test it**: Wait 5 minutes, check queue status, items should process automatically!











