# Supabase CLI Migration Guide

This project uses **Supabase CLI** for database migrations. This is the professional way to manage your database schema.

## ✅ Benefits

- **Version Control**: All schema changes are tracked in Git
- **Repeatability**: Recreate your database anywhere
- **Team Collaboration**: Everyone sees the same schema
- **No Manual Clicking**: Apply changes from terminal
- **Type Safety**: Generate TypeScript types from your schema

## 🚀 Quick Start

### 1. Install Supabase CLI

The CLI is already installed! If you need to install it again:

```bash
brew install supabase/tap/supabase
```

### 2. Link Your Project

You need to link this local project to your Supabase instance **once**:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

**Where to find your project ref:**
1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Go to Settings → General
4. Copy the "Reference ID" (looks like: `abcd1234efgh5678`)

Or use the helper script:

```bash
chmod +x scripts/link-supabase.sh
./scripts/link-supabase.sh
```

### 3. Push Migrations

Apply all migrations to your database:

```bash
supabase db push
```

Or use the helper script:

```bash
chmod +x scripts/push-migrations.sh
./scripts/push-migrations.sh
```

## 📁 Project Structure

```
bike-dashboard/
├── supabase/
│   ├── config.toml          # Supabase configuration
│   └── migrations/           # All database migrations
│       └── 20251127022700_create_users_table.sql
├── scripts/
│   ├── link-supabase.sh     # Helper to link project
│   └── push-migrations.sh   # Helper to push migrations
```

## 🔄 Creating New Migrations

### Example: Add a new column

```bash
supabase migration new add_store_logo
```

This creates: `supabase/migrations/20251127_add_store_logo.sql`

Edit the file:

```sql
ALTER TABLE users ADD COLUMN logo_url TEXT;
```

Then push:

```bash
supabase db push
```

### Example: Create a new table

```bash
supabase migration new create_products_table
```

Edit the file:

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  USING (auth.uid() = user_id);
```

Then push:

```bash
supabase db push
```

## 🎯 Common Commands

### Create a migration
```bash
supabase migration new migration_name
```

### Push migrations to Supabase
```bash
supabase db push
```

### Generate TypeScript types
```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

### Reset local database (for testing)
```bash
supabase db reset
```

### View migration status
```bash
supabase migration list
```

## 📝 Best Practices

1. **One migration per feature**: Don't combine unrelated changes
2. **Descriptive names**: `add_user_avatar` not `update_users`
3. **Test locally first**: Use `supabase start` for local development
4. **Always use IF NOT EXISTS**: Makes migrations idempotent
5. **Include rollback**: Add comments explaining how to undo
6. **Review before push**: Check SQL before applying

## 🔐 Security

- Migrations are applied using your project's admin credentials
- Always use Row Level Security (RLS) for tables
- Never commit `.env.local` or access tokens to Git

## 🐛 Troubleshooting

### Error: "Project not linked"
Run: `supabase link --project-ref YOUR_PROJECT_REF`

### Error: "Migration already applied"
The migration was already run. Check with: `supabase migration list`

### Error: "Database password required"
Get it from: Supabase Dashboard → Settings → Database → Password

### Need to rollback?
Create a new migration that reverses the change:
```bash
supabase migration new rollback_feature_name
```

## 🎓 Learn More

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
- [Database Migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Managing Environments](https://supabase.com/docs/guides/cli/managing-environments)

## 📦 Current Migrations

### ✅ `20251127022700_create_users_table.sql`
Creates the `users` table with:
- User profile fields (name, email, phone, etc.)
- Business information (business_name, store_type, address)
- Notification preferences
- Row Level Security policies
- Auto-updating timestamps

**To apply:**
```bash
supabase db push
```

---

**Never manually create tables in Supabase UI again!** Always use migrations. 🎉





