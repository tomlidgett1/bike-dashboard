# 📋 Workflow: Adding a New Field

**Follow this checklist every time you add a new field to your application.**

## ✅ Step-by-Step Checklist

### 1. Create Migration First (Database)
```bash
supabase migration new add_field_name
```

**Example:** Adding a `phone_verified` boolean field
```bash
supabase migration new add_phone_verified
```

### 2. Edit the Migration SQL File
```sql
-- supabase/migrations/TIMESTAMP_add_phone_verified.sql
ALTER TABLE users ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT false;
```

**Common patterns:**
```sql
-- Text field
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';

-- Number field
ALTER TABLE users ADD COLUMN age INTEGER;

-- Timestamp
ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;

-- JSON field
ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb;

-- Enum-like field
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' 
  CHECK (role IN ('user', 'admin', 'manager'));
```

### 3. Push the Migration
```bash
supabase db push
```

### 4. Update TypeScript Interface
**File:** `src/lib/hooks/use-user-profile.ts` (or relevant file)

```typescript
export interface UserProfile {
  // ... existing fields
  phone_verified: boolean  // ⭐ Add new field
}
```

### 5. Update Hook/Service Functions

**Add to default/blank profile objects:**
```typescript
setProfile({
  user_id: user.id,
  name: '',
  // ... other fields
  phone_verified: false,  // ⭐ Add with default value
})
```

**Add to form state loading:**
```typescript
setFormData({
  name: profile.name || "",
  // ... other fields
  phoneVerified: profile.phone_verified ?? false,  // ⭐ Add
})
```

**Add to save function:**
```typescript
const result = await saveProfile({
  name: formData.name,
  // ... other fields
  phone_verified: formData.phoneVerified,  // ⭐ Add
})
```

### 6. Update UI Component
**File:** `src/app/settings/page.tsx` (or relevant page)

**Add to form state:**
```typescript
const [formData, setFormData] = React.useState({
  name: "",
  // ... other fields
  phoneVerified: false,  // ⭐ Add
})
```

**Add the input field:**
```tsx
<div className="space-y-2">
  <Label htmlFor="phoneVerified" className="text-sm font-medium">
    Phone Verified
  </Label>
  <Switch
    checked={formData.phoneVerified}
    onCheckedChange={(checked) => updateForm("phoneVerified", checked)}
  />
</div>
```

### 7. Test End-to-End
- [ ] Form displays the new field
- [ ] Can input/change the value
- [ ] Click "Save Changes"
- [ ] Check Supabase Table Editor - new column has data
- [ ] Refresh page - value persists
- [ ] Check browser console - no errors

---

## 🎯 Quick Example: Adding "Date of Birth"

```bash
# 1. Create migration
supabase migration new add_date_of_birth

# 2. Edit SQL file
# supabase/migrations/TIMESTAMP_add_date_of_birth.sql
ALTER TABLE users ADD COLUMN date_of_birth DATE;

# 3. Push
supabase db push
```

```typescript
// 4. Update interface (use-user-profile.ts)
export interface UserProfile {
  // ...
  date_of_birth: string | null
}

// 5. Update hook functions
setProfile({
  // ...
  date_of_birth: null,
})

setFormData({
  // ...
  dateOfBirth: profile.date_of_birth || "",
})

await saveProfile({
  // ...
  date_of_birth: formData.dateOfBirth || null,
})

// 6. Add to form state
const [formData, setFormData] = React.useState({
  // ...
  dateOfBirth: "",
})

// 7. Add UI component
<Input
  type="date"
  value={formData.dateOfBirth}
  onChange={(e) => updateForm("dateOfBirth", e.target.value)}
/>
```

---

## ⚠️ Common Mistakes to Avoid

❌ **DON'T** add UI fields without database columns  
❌ **DON'T** manually create columns in Supabase UI  
❌ **DON'T** forget to update the TypeScript interface  
❌ **DON'T** skip testing after adding a field  

✅ **DO** create migration first  
✅ **DO** use migrations for all schema changes  
✅ **DO** update all relevant files (interface, hook, UI)  
✅ **DO** test end-to-end before moving on  

---

## 📝 Field Type Reference

| Type | SQL | TypeScript | Example |
|------|-----|------------|---------|
| Text | `TEXT` | `string` | Name, email, bio |
| Number | `INTEGER` | `number` | Age, count |
| Decimal | `DECIMAL(10,2)` | `number` | Price, rating |
| Boolean | `BOOLEAN` | `boolean` | Verified, active |
| Date | `DATE` | `string` | Birth date |
| Timestamp | `TIMESTAMPTZ` | `string` | Created at |
| JSON | `JSONB` | `object` | Settings, metadata |
| UUID | `UUID` | `string` | IDs, references |

---

## 🚀 Pro Tips

1. **Always add defaults** for NOT NULL columns to avoid errors
2. **Use descriptive migration names**: `add_user_timezone` not `update_users`
3. **Test locally first** if you have local Supabase setup
4. **One field per migration** keeps things clean and reversible
5. **Comment your SQL** to explain why the field exists

---

**Remember:** Migration → Interface → Hook → UI → Test

This ensures your database, TypeScript types, and UI stay in perfect sync! 🎯














