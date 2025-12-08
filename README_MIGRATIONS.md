# 🎯 Database Migrations - Command Reference

## ✅ Setup Complete!

Supabase CLI is installed and configured. You have a professional migration system ready to go.

---

## 🚀 First Time Setup (Do This Once)

### 1. Link to Your Supabase Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

**Get your project ref:**
- Go to https://app.supabase.com
- Select your project
- Settings → General → Reference ID

### 2. Push Your First Migration

```bash
supabase db push
```

This creates the `users` table with all fields including `store_type`.

✅ **That's it!** Your database is ready.

---

## 🔄 Daily Workflow

### Create a New Migration

```bash
supabase migration new your_migration_name
```

Examples:
```bash
supabase migration new add_products_table
supabase migration new add_user_avatar_column
supabase migration new create_orders_table
```

### Edit the Migration

Open the generated file in `supabase/migrations/` and add your SQL:

```sql
-- Example: Add a column
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- Example: Create a table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Push to Supabase

```bash
supabase db push
```

---

## 📋 Common Migrations

### Add a Column
```bash
supabase migration new add_column_name
```

```sql
ALTER TABLE users ADD COLUMN column_name TEXT NOT NULL DEFAULT '';
```

### Create a Table
```bash
supabase migration new create_table_name
```

```sql
CREATE TABLE table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data"
  ON table_name FOR SELECT
  USING (auth.uid() = user_id);
```

### Add an Index
```bash
supabase migration new add_index_name
```

```sql
CREATE INDEX idx_users_email ON users(email);
```

---

## 🛠️ Useful Commands

```bash
# View migration history
supabase migration list

# Generate TypeScript types from your database
supabase gen types typescript --linked > src/lib/database.types.ts

# Check migration status
supabase db diff

# View remote migrations
supabase migration list --remote
```

---

## 📁 Project Structure

```
bike-dashboard/
├── supabase/
│   ├── config.toml                          # Supabase config
│   └── migrations/                          # ⭐ Your migrations
│       └── 20251127022700_create_users_table.sql
├── scripts/
│   ├── link-supabase.sh                     # Helper script
│   └── push-migrations.sh                   # Helper script
└── SUPABASE_CLI_GUIDE.md                    # Full documentation
```

---

## 🎓 Why This Is Better

### ❌ Old Way (Manual UI)
- Click around Supabase dashboard
- No version control
- Hard to replicate
- Team members out of sync
- Easy to make mistakes

### ✅ New Way (Migrations)
- Everything in code
- Version controlled in Git
- One command deploys changes
- Team stays in sync
- Repeatable and safe

---

## 🔐 Security Notes

- Never commit `.env.local` or database passwords
- Always use Row Level Security (RLS)
- Test migrations locally first
- Review SQL before pushing

---

## 💡 Pro Tips

1. **One migration per feature** - Don't combine unrelated changes
2. **Descriptive names** - `add_user_avatar` not `update_table`
3. **Use IF NOT EXISTS** - Makes migrations safer
4. **Comment your SQL** - Future you will thank you
5. **Push often** - Don't let migrations pile up

---

## 🆘 Need Help?

- **Full Guide**: See `SUPABASE_CLI_GUIDE.md`
- **Quick Start**: See `QUICK_MIGRATION_STEPS.md`
- **Supabase Docs**: https://supabase.com/docs/guides/cli

---

## 📝 Current Status

✅ Supabase CLI installed  
✅ Project initialized  
✅ Migration created: `create_users_table.sql`  
⏳ **Next step**: Link and push!

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

---

**You're now set up like a production engineering team!** 🎉









