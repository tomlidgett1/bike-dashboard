# 🚀 Quick Migration Setup (2 Minutes)

## Step 1: Get Your Project Info

Go to [Supabase Dashboard](https://app.supabase.com):
1. Select your project
2. Go to **Settings → General**
3. Copy your **Reference ID** (looks like: `abcd1234efgh5678`)

## Step 2: Link Your Project

In your terminal:

```bash
cd /Users/user/Desktop/Bike/bike-dashboard
supabase link --project-ref YOUR_PROJECT_REF
```

Enter your database password when prompted.

## Step 3: Push the Migration

```bash
supabase db push
```

That's it! ✅

The `users` table is now created in your Supabase database with all columns including `store_type`.

## Verify It Worked

1. Go to Supabase Dashboard → Table Editor
2. You should see the `users` table
3. Open your app → Settings page
4. Fill in the form and click "Save Changes"
5. Check the `users` table - your data should be there!

## Next Time You Need to Change the Schema

```bash
# Create a new migration
supabase migration new add_new_column

# Edit the generated file in supabase/migrations/

# Push it
supabase db push
```

## Helper Scripts

We've created helper scripts for you:

```bash
# Link project (only needed once)
./scripts/link-supabase.sh

# Push migrations
./scripts/push-migrations.sh
```

---

**For full documentation, see:** `SUPABASE_CLI_GUIDE.md`











