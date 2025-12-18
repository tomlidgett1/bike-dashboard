# Database Migration Workflow

## 🎯 Golden Rule

**ALL database schema changes MUST be done via Supabase CLI migrations.**

**NEVER run SQL directly in Supabase Dashboard** (except for debugging or one-time data fixes).

---

## 📋 Standard Workflow

### Step 1: Create Migration File

```bash
supabase migration new descriptive_name
```

**Examples:**
```bash
supabase migration new add_logo_url
supabase migration new create_products_table
supabase migration new add_user_roles
```

This creates a file like: `supabase/migrations/20251127123456_descriptive_name.sql`

### Step 2: Write SQL in Migration File

Edit the generated file in `supabase/migrations/`:

```sql
-- Add logo_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('logo', 'logo', true)
ON CONFLICT (id) DO NOTHING;

-- Add RLS policies
CREATE POLICY "Users can upload own logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logo' AND auth.uid()::text = (SPLIT_PART(name, '/', 1)));
```

### Step 3: Apply Migration

```bash
supabase db push
```

This applies the migration to your Supabase database.

### Step 4: Commit to Git

```bash
git add supabase/migrations/
git commit -m "Add logo upload feature"
```

---

## ✅ Benefits of This Approach

| Benefit | Description |
|---------|-------------|
| **Version Control** | All schema changes tracked in Git |
| **Repeatability** | Can recreate database on any environment |
| **Team Collaboration** | Everyone has the same schema |
| **Rollback** | Can revert changes if needed |
| **CI/CD Ready** | Migrations can be automated |
| **Documentation** | Migration files serve as schema history |
| **Type Safety** | Can generate TypeScript types from schema |

---

## 🚫 What NOT to Do

### ❌ Don't Do This:

```
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Paste SQL
4. Click Run
```

**Why not?**
- Changes not in version control
- Can't recreate on other environments
- Team members won't have the changes
- No rollback capability
- No documentation of what changed

### ❌ Don't Create Tables Manually:

Using the Supabase Dashboard Table Editor is also discouraged. Always use migrations.

---

## ✅ What TO Do

### ✅ Always Use CLI:

```bash
# 1. Create migration
supabase migration new add_feature

# 2. Edit the SQL file
# (opens in your editor)

# 3. Apply migration
supabase db push

# 4. Commit to git
git add supabase/migrations/
git commit -m "Add feature"
```

---

## 🔧 Common Migration Patterns

### Adding a Column

```sql
-- Add column with default value
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add column with constraint
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE NOT NULL;
```

### Creating a Table

```sql
-- Create table with RLS
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Users can view own products"
ON products FOR SELECT
USING (auth.uid() = user_id);
```

### Creating Storage Bucket

```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('images', 'images', true, 5242880)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880;

-- Add RLS policies
CREATE POLICY "Users can upload own images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'images' AND
  auth.uid()::text = SPLIT_PART(name, '/', 1)
);
```

### Adding Indexes

```sql
-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_user_id 
ON products(user_id);

-- Add partial index
CREATE INDEX IF NOT EXISTS idx_products_active 
ON products(status) 
WHERE status = 'active';
```

### Adding RLS Policies

```sql
-- Drop old policy if exists
DROP POLICY IF EXISTS "policy_name" ON table_name;

-- Create new policy
CREATE POLICY "policy_name"
ON table_name
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

---

## 🐛 Exception Cases

### When Manual SQL is OK:

1. **Emergency Debugging**
   ```sql
   -- Check if data exists
   SELECT * FROM users WHERE email = 'test@example.com';
   ```

2. **One-Time Data Fixes**
   ```sql
   -- Fix incorrect data (not schema)
   UPDATE users SET status = 'active' WHERE status IS NULL;
   ```

3. **Quick Verification**
   ```sql
   -- Check if column exists
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'users';
   ```

**Important:** Even for these cases, if it's a schema change, create a migration afterward!

---

## 📝 Migration Best Practices

### 1. Use Idempotent SQL

Always use `IF EXISTS` and `IF NOT EXISTS`:

```sql
-- Good
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;
DROP POLICY IF EXISTS "old_policy" ON users;

-- Bad (will fail if run twice)
ALTER TABLE users ADD COLUMN logo_url TEXT;
DROP POLICY "old_policy" ON users;
```

### 2. Descriptive Names

```bash
# Good
supabase migration new add_logo_url_to_users
supabase migration new create_products_table
supabase migration new add_user_role_enum

# Bad
supabase migration new update
supabase migration new fix
supabase migration new changes
```

### 3. Complete Migrations

Include everything related to a feature:

```sql
-- Add table
CREATE TABLE products (...);

-- Add indexes
CREATE INDEX idx_products_user_id ON products(user_id);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "..." ON products FOR SELECT USING (...);

-- Add constraints
ALTER TABLE products ADD CONSTRAINT check_price_positive 
CHECK (price > 0);
```

### 4. Add Comments

```sql
-- Migration: Add product catalog feature
-- Date: 2024-01-15
-- Author: Team
-- Description: Creates products table with full RLS policies

CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Product name (required)
  name TEXT NOT NULL,
  -- Price in USD (must be positive)
  price DECIMAL(10,2) NOT NULL CHECK (price > 0),
  -- Owner of the product
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);
```

---

## 🔍 Useful Commands

### Check Migration Status

```bash
# List all migrations
supabase migration list

# Show migration history
git log --oneline supabase/migrations/
```

### Generate TypeScript Types

```bash
# Generate types from current schema
supabase gen types typescript --local > src/types/supabase.ts
```

### Reset Local Database

```bash
# Reset and reapply all migrations
supabase db reset
```

### Create Migration from Diff

```bash
# If you made changes in Dashboard (not recommended)
# You can generate a migration from the diff
supabase db diff --schema public
```

---

## 🎓 Learning Resources

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
- [Database Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [SQL Best Practices](https://supabase.com/docs/guides/database/overview)

---

## ✨ Quick Reference

```bash
# Create migration
supabase migration new name

# Apply migrations
supabase db push

# List migrations
supabase migration list

# Reset database
supabase db reset

# Generate types
supabase gen types typescript --local > src/types/supabase.ts

# Link project (first time)
supabase link --project-ref YOUR_REF
```

---

## 🎯 Remember

**Migrations = Single Source of Truth for Database Schema**

Always use them! 🚀















