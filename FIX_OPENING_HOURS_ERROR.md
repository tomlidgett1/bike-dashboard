# Fix: Opening Hours Save Error

## ❌ The Error

```
Error saving profile: {}
```

This error occurs when trying to save opening hours because the database column doesn't exist yet.

---

## ✅ The Fix (1 Command)

Run this command to apply the migration:

```bash
supabase db push
```

This will add the `opening_hours` column to your database.

---

## 🔍 What Happened

1. The opening hours feature was implemented
2. Migration file was created: `supabase/migrations/20251127032358_add_opening_hours.sql`
3. But the migration hasn't been applied to the database yet
4. When you try to save, the database rejects it because the column doesn't exist

---

## 📋 Step-by-Step Fix

### Option 1: Using Supabase CLI (Recommended)

```bash
# Apply the migration
supabase db push
```

### Option 2: Manual SQL (If CLI doesn't work)

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy the contents of `supabase/migrations/20251127032358_add_opening_hours.sql`
3. Paste and click **Run**

The SQL adds:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{...}';
```

---

## ✅ Verify It Worked

After applying the migration:

1. **Refresh your browser** (Cmd/Ctrl + Shift + R)
2. Go to **Settings** page
3. Set your opening hours
4. Click **Save Changes**
5. Should save successfully! ✅

---

## 🔍 Check Migration Status

To see if the migration was applied:

```bash
supabase migration list
```

You should see:
```
20251127032358_add_opening_hours.sql ✓ Applied
```

---

## 📖 Migration File Location

The migration file is at:
```
supabase/migrations/20251127032358_add_opening_hours.sql
```

It contains:
- Column definition
- Default values
- Index creation
- Comments

---

## 🎯 After Applying Migration

Once the migration is applied:

1. **Opening hours will save** successfully
2. **Default hours** will be set automatically
3. **Changes will persist** across sessions
4. **No more errors** when saving

---

## 💡 Why Migrations?

We use migrations because:
- ✅ Version control for database changes
- ✅ Repeatable across environments
- ✅ Team collaboration
- ✅ Rollback capability
- ✅ Professional workflow

This follows the `.cursorrules` requirement:
> All SQL changes MUST use Supabase CLI migrations

---

## 🚀 Quick Summary

**Problem:** Database column doesn't exist yet

**Solution:** Run `supabase db push`

**Result:** Opening hours feature works perfectly!

---

## 📞 Still Having Issues?

If `supabase db push` doesn't work:

1. **Check Supabase CLI installed:**
   ```bash
   supabase --version
   ```

2. **Check project linked:**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. **Use manual SQL** (see Option 2 above)

---

## ✅ That's It!

Run `supabase db push` and the error will be fixed! 🎉











