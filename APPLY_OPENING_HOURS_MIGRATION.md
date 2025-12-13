# Apply Opening Hours Migration

## ✅ Opening Hours Feature Ready!

The opening hours feature has been fully implemented. You just need to apply the database migration.

---

## 🚀 Quick Start (2 Steps)

### Step 1: Apply Migration

```bash
supabase db push
```

This adds the `opening_hours` column to your users table.

### Step 2: Restart Server

```bash
# Stop server
Ctrl + C

# Start again
npm run dev
```

---

## 🎯 What You'll See

After applying the migration and restarting:

1. Go to **Settings** page
2. Scroll down to find **"Opening Hours"** section
3. Set your store hours for each day
4. Use **"Copy to all"** to duplicate hours
5. Toggle days as **Open/Closed**
6. Click **"Save Changes"**

---

## 📋 Migration Details

**File:** `supabase/migrations/20251127032358_add_opening_hours.sql`

**What it does:**
- Adds `opening_hours` JSONB column
- Sets default hours (Mon-Fri 9-5, Sat 10-4, Sun closed)
- Creates index for performance

---

## ✨ Features

- **Day-by-day editor** with visual cards
- **Open/Closed toggle** for each day
- **Time pickers** for opening/closing times
- **Copy to all** button for convenience
- **Mobile responsive** design
- **Auto-saves** with profile

---

## 🔍 Verify Migration Applied

After running `supabase db push`, check:

```sql
-- In Supabase SQL Editor
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name = 'opening_hours';
```

Should return:
```
column_name    | data_type
opening_hours  | jsonb
```

---

## 📖 Documentation

See `OPENING_HOURS_FEATURE.md` for:
- Complete technical details
- Data structure
- Usage examples
- Future enhancements

---

## ✅ That's It!

Run `supabase db push` and you're done! 🎉












