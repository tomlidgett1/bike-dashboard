# Logo Upload Feature - Complete Guide

## 🚨 GETTING THE RLS ERROR?

**👉 START HERE:** Open `APPLY_THIS_FIX_NOW.md` and follow the 3-step fix.

The error `new row violates row-level security policy` means you need to set up the storage bucket policies in Supabase.

---

## 📚 Documentation Files

| File | Purpose | When to Use |
|------|---------|-------------|
| **APPLY_THIS_FIX_NOW.md** | Quick 5-minute fix for RLS error | ⭐ Start here if you have the error |
| **FIX_STORAGE_RLS.sql** | SQL script to run in Supabase | Copy/paste into SQL Editor |
| **TROUBLESHOOTING_LOGO_UPLOAD.md** | Detailed troubleshooting guide | When the quick fix doesn't work |
| **LOGO_UPLOAD_FEATURE.md** | Complete feature documentation | Learn how the feature works |
| **QUICK_FIX_RLS_ERROR.md** | Alternative quick fix guide | Another approach to fixing RLS |
| **MANUAL_STORAGE_SETUP.sql** | Comprehensive SQL setup | Complete database setup |

---

## ✅ What Was Implemented

### 1. Database & Storage
- ✅ Added `logo_url` column to `users` table
- ✅ Created `logo` storage bucket in Supabase
- ✅ Set up Row Level Security (RLS) policies
- ✅ Configured public access for viewing logos

### 2. Settings Page
- ✅ Logo upload section with preview
- ✅ File validation (images only, max 5MB)
- ✅ Remove logo functionality
- ✅ Automatic cleanup of old logos

### 3. UI Integration
- ✅ Logo appears in header avatar (top right)
- ✅ Logo appears in sidebar (desktop & mobile)
- ✅ Fallback to initials/default icon if no logo

---

## 🚀 Quick Start

### Step 1: Apply Database Migration

**Option A: Using Supabase CLI**
```bash
supabase db push
```

**Option B: Manual SQL (Recommended if you have errors)**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `FIX_STORAGE_RLS.sql`
3. Paste and click Run

### Step 2: Test Upload

1. Go to Settings page in your app
2. Scroll to "Business Logo" section
3. Upload an image
4. Save changes
5. Logo should appear in header and sidebar

---

## 🎯 How It Works

### Upload Flow

```
User selects image
    ↓
File validation (type, size)
    ↓
Preview generated
    ↓
User clicks "Save Changes"
    ↓
Old logo deleted (if exists)
    ↓
New logo uploaded to: logo/{user_id}/{timestamp}.ext
    ↓
Public URL generated
    ↓
URL saved to users.logo_url
    ↓
Profile refreshed
    ↓
Logo appears in UI
```

### Storage Structure

```
logo/                                    (bucket)
  └── {user_id}/                        (folder per user)
      └── {timestamp}.{ext}             (actual file)
```

Example: `logo/abc123.../1701234567890.png`

### Security

- ✅ Users can only upload to their own folder
- ✅ Users can only delete their own files
- ✅ Anyone can view logos (public bucket)
- ✅ File size limited to 5MB
- ✅ Only image files allowed

---

## 📋 Files Modified

### Core Implementation
```
src/
  ├── app/
  │   └── settings/
  │       └── page.tsx                  ← Logo upload UI
  ├── components/
  │   └── layout/
  │       ├── header.tsx                ← Avatar with logo
  │       └── sidebar.tsx               ← Sidebar with logo
  └── lib/
      └── hooks/
          └── use-user-profile.ts       ← Added logo_url field

supabase/
  └── migrations/
      └── 20251127023632_add_logo_url.sql  ← Database migration
```

### Documentation
```
APPLY_THIS_FIX_NOW.md              ← ⭐ Start here for RLS error
FIX_STORAGE_RLS.sql                ← SQL to run in Supabase
TROUBLESHOOTING_LOGO_UPLOAD.md     ← Detailed troubleshooting
LOGO_UPLOAD_FEATURE.md             ← Feature documentation
QUICK_FIX_RLS_ERROR.md             ← Alternative quick fix
MANUAL_STORAGE_SETUP.sql           ← Complete SQL setup
README_LOGO_FEATURE.md             ← This file
```

---

## 🐛 Common Issues

### Issue 1: RLS Error on Upload
**Error:** `new row violates row-level security policy`

**Fix:** Run the SQL from `APPLY_THIS_FIX_NOW.md`

### Issue 2: Logo Not Displaying
**Possible causes:**
- Logo URL not saved to database
- Image failed to upload
- Browser cache

**Fix:**
1. Check browser console for errors
2. Verify logo URL in database
3. Clear browser cache
4. Try re-uploading

### Issue 3: Upload Button Not Working
**Possible causes:**
- File too large (>5MB)
- Wrong file type (not an image)
- Not logged in

**Fix:**
1. Check file size and type
2. Sign out and back in
3. Check browser console

---

## 🔍 Debugging

### Check if bucket exists:
```sql
SELECT * FROM storage.buckets WHERE id = 'logo';
```

### Check RLS policies:
```sql
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'objects' 
  AND policyname LIKE 'logo_%';
```

### Check user's logo URL:
```sql
SELECT user_id, logo_url 
FROM users 
WHERE user_id = 'YOUR_USER_ID';
```

### Add debug logging:
```typescript
// In settings page, add to uploadLogo function
console.log('Upload debug:', {
  userId: user?.id,
  fileName: logoFile?.name,
  fileSize: logoFile?.size,
  fileType: logoFile?.type
});
```

---

## 📱 User Guide

### For End Users

**To Upload Logo:**
1. Go to Settings
2. Scroll to "Business Logo"
3. Click "Choose Image"
4. Select image (JPG, PNG, GIF)
5. Preview appears
6. Click "Save Changes"
7. Logo appears in header and sidebar

**To Remove Logo:**
1. Click X button on logo preview
2. Logo is deleted
3. Default icon appears

**Requirements:**
- Image file (JPG, PNG, GIF, WebP)
- Maximum size: 5MB
- Recommended: Square image, 200x200px or larger

---

## 🚀 Next Steps

After getting the logo upload working:

1. ✅ Test with different image formats
2. ✅ Test with different file sizes
3. ✅ Test on mobile devices
4. ✅ Test logo removal
5. ✅ Verify logo appears everywhere

Optional enhancements:
- [ ] Add image cropping
- [ ] Add image compression
- [ ] Add drag-and-drop upload
- [ ] Add multiple logo variants (light/dark)
- [ ] Generate favicon from logo

---

## 📞 Support

- **Supabase Docs:** https://supabase.com/docs/guides/storage
- **Supabase Discord:** https://discord.supabase.com
- **GitHub Issues:** https://github.com/supabase/supabase/issues

---

## 🎉 Success!

Once you see your logo in the header and sidebar, you're all set! 

The logo will:
- ✅ Appear in the user avatar (top right)
- ✅ Appear in the sidebar logo (top left)
- ✅ Appear in mobile navigation
- ✅ Persist across sessions
- ✅ Be visible to all users (public)

Enjoy your new logo upload feature! 🚀











