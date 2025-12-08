# Apply Opening Hours Migration - Quick Steps

## 🚨 You Need to Run This SQL

The `opening_hours` column needs to be added to fix the save error.

---

## ⚡ Fastest Method (1 Minute)

### Go to Supabase Dashboard

**Direct Link:** https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/sql/new

### Copy & Paste This SQL

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{
  "monday": {"open": "09:00", "close": "17:00", "closed": false},
  "tuesday": {"open": "09:00", "close": "17:00", "closed": false},
  "wednesday": {"open": "09:00", "close": "17:00", "closed": false},
  "thursday": {"open": "09:00", "close": "17:00", "closed": false},
  "friday": {"open": "09:00", "close": "17:00", "closed": false},
  "saturday": {"open": "10:00", "close": "16:00", "closed": false},
  "sunday": {"open": "10:00", "close": "16:00", "closed": true}
}'::jsonb;

CREATE INDEX IF NOT EXISTS users_opening_hours_idx ON users USING GIN (opening_hours);
```

### Click "Run"

### Refresh Your App

Hard refresh (Cmd/Ctrl + Shift + R) and try saving again!

---

## 🔧 Alternative: Use Supabase CLI

If you want to use the CLI (requires login):

```bash
# Login to Supabase
supabase login

# Push migrations
supabase db push
```

---

## ✅ Done!

After running the SQL, your settings will save successfully with opening hours! 🎉

**The SQL is also in:** `RUN_THIS_SQL_NOW.sql`









