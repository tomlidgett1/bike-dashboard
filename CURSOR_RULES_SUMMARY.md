# Cursor Rules - Summary

## ✅ Rules File Created

I've created a `.cursorrules` file that enforces best practices for this project.

## 🎯 Main Rule: Database Migrations

### The Golden Rule

**ALL database schema changes MUST use Supabase CLI migrations.**

**NEVER run SQL directly in Supabase Dashboard SQL Editor.**

### Why?

- ✅ Version control - All changes tracked in Git
- ✅ Repeatability - Can recreate database anywhere
- ✅ Team collaboration - Everyone has same schema
- ✅ Rollback capability - Can revert if needed
- ✅ CI/CD ready - Automated deployments
- ✅ Documentation - Migration files = schema history

### The Workflow

```bash
# 1. Create migration
supabase migration new descriptive_name

# 2. Edit SQL file in supabase/migrations/

# 3. Apply migration
supabase db push

# 4. Commit to git
git add supabase/migrations/
git commit -m "Add feature"
```

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `.cursorrules` | Cursor AI rules for this project |
| `DATABASE_WORKFLOW.md` | Complete migration workflow guide |
| `SUPABASE_CLI_GUIDE.md` | Supabase CLI setup and usage |

## 🤖 What Cursor AI Will Do Now

When you ask Cursor AI to make database changes, it will:

1. ✅ Create a migration file
2. ✅ Write SQL in the migration
3. ✅ Tell you to run `supabase db push`
4. ❌ Never tell you to use Supabase Dashboard SQL Editor

## 🎓 Quick Reference

### Creating a Migration

```bash
# Good names
supabase migration new add_logo_url
supabase migration new create_products_table
supabase migration new add_user_roles

# Bad names
supabase migration new update
supabase migration new fix
```

### Migration Template

```sql
-- Description: What this migration does
-- Date: YYYY-MM-DD

-- Use idempotent SQL
ALTER TABLE users ADD COLUMN IF NOT EXISTS new_column TEXT;

-- Include all related changes
CREATE INDEX IF NOT EXISTS idx_users_new_column ON users(new_column);

-- Add RLS policies
DROP POLICY IF EXISTS "old_policy" ON users;
CREATE POLICY "new_policy" ON users FOR SELECT USING (...);
```

### Applying Migrations

```bash
# Apply all pending migrations
supabase db push

# Check status
supabase migration list

# Reset database (dev only)
supabase db reset
```

## 🚫 What NOT to Do

### ❌ Don't:
- Open Supabase Dashboard → SQL Editor
- Paste SQL and click Run
- Create tables manually in Dashboard
- Make schema changes without migrations

### ✅ Do:
- Use `supabase migration new`
- Write SQL in migration files
- Apply with `supabase db push`
- Commit migrations to Git

## 🔧 Exception Cases

Manual SQL is OK ONLY for:
1. Emergency debugging
2. One-time data fixes (not schema)
3. Quick verification queries

Even then, document what you did!

## 📖 Learn More

- **DATABASE_WORKFLOW.md** - Complete workflow guide
- **SUPABASE_CLI_GUIDE.md** - CLI setup and commands
- **.cursorrules** - Full rules for Cursor AI

## 🎉 Benefits

With these rules in place:

1. **Consistency** - Everyone follows same workflow
2. **Safety** - No accidental schema changes
3. **Documentation** - All changes tracked
4. **Collaboration** - Easy to share and review
5. **Professional** - Industry best practices

---

**Remember:** Migrations are your single source of truth! 🚀





