# Logo Upload Feature

## Overview
A complete logo upload system has been implemented that allows users to upload their business logo, which is then displayed as avatars throughout the application.

## What Was Implemented

### 1. Database Migration
**File**: `supabase/migrations/20251127023632_add_logo_url.sql`

- Added `logo_url` column to the `users` table
- Created a public storage bucket named `logo` in Supabase
- Implemented Row Level Security (RLS) policies for the storage bucket:
  - Users can upload their own logos
  - Users can update their own logos
  - Users can delete their own logos
  - Anyone can view logos (public bucket)

### 2. User Profile Interface Update
**File**: `src/lib/hooks/use-user-profile.ts`

- Added `logo_url?: string` field to the `UserProfile` interface

### 3. Settings Page - Logo Upload Section
**File**: `src/app/settings/page.tsx`

Added a new "Business Logo" section with:
- Logo preview (24x24 rounded square)
- File upload button with validation
- Remove logo button
- File validation:
  - Only image files accepted
  - Maximum file size: 5MB
- Automatic upload when saving settings
- Preview of selected logo before saving

Features:
- Upload new logo
- Preview logo before saving
- Remove existing logo
- Automatic cleanup of old logos when uploading new ones

### 4. Avatar Display in Header
**File**: `src/components/layout/header.tsx`

- Updated user avatar to display uploaded logo
- Falls back to user initials if no logo is uploaded
- Improved initials logic to use full name from profile

### 5. Sidebar Logo Display
**Files**: 
- `src/components/layout/sidebar.tsx` (Desktop sidebar)
- `src/components/layout/sidebar.tsx` (Mobile sidebar)

- Replaced default bike icon with uploaded logo
- Shows business name from profile
- Falls back to default icon and "Bike Dashboard" if no logo/name

## How to Use

### For Users

1. **Navigate to Settings**
   - Go to the Settings page in your dashboard

2. **Upload Logo**
   - Scroll to the "Business Logo" section
   - Click "Choose Image" button
   - Select an image file (JPG, PNG, GIF)
   - Preview will appear immediately
   - Click "Save Changes" to upload and save

3. **Remove Logo**
   - Click the X button on the logo preview
   - Confirm removal
   - Logo will be deleted from storage

4. **View Logo**
   - Logo appears in the header avatar (top right)
   - Logo appears in the sidebar (top left, desktop and mobile)
   - Logo appears in mobile navigation

### For Developers

#### Applying the Migration

Before using this feature, you need to apply the database migration:

**Option 1: Using Supabase CLI (Recommended)**
```bash
# Link your Supabase project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

Or use the helper script:
```bash
./scripts/push-migrations.sh
```

**Option 2: Manual SQL (If CLI doesn't work)**

If you encounter RLS errors, run the SQL manually:

1. Go to your Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `MANUAL_STORAGE_SETUP.sql`
3. Click Run

See `TROUBLESHOOTING_LOGO_UPLOAD.md` for detailed troubleshooting steps.

#### Storage Bucket Structure

Logos are stored in the following structure:
```
logo/
  └── {user_id}/
      └── {timestamp}.{extension}
```

Example: `logo/123e4567-e89b-12d3-a456-426614174000/1701234567890.png`

#### File Validation

- **Accepted formats**: Any image/* MIME type (JPG, PNG, GIF, WebP, etc.)
- **Maximum size**: 5MB
- **Recommended**: Square images, at least 200x200px

#### Security

- RLS policies ensure users can only upload/modify their own logos
- Old logos are automatically deleted when new ones are uploaded
- Public read access for displaying logos across the app

## Technical Details

### Storage Configuration

The `logo` bucket is configured as:
- **Public**: Yes (allows public read access)
- **File size limit**: Inherited from Supabase config (50MB max)
- **RLS**: Enabled with custom policies

### Upload Flow

1. User selects image file
2. File is validated (type and size)
3. Preview is generated using FileReader API
4. On save:
   - Old logo is deleted from storage (if exists)
   - New logo is uploaded to `logo/{user_id}/{timestamp}.{ext}`
   - Public URL is generated
   - URL is saved to `users.logo_url` column
   - Profile is refreshed

### Display Flow

1. `useUserProfile` hook fetches user profile including `logo_url`
2. Components check if `logo_url` exists
3. If exists, display using Next.js `Image` component or `AvatarImage`
4. If not, fall back to default icon or initials

## Future Enhancements

Potential improvements:
- Image cropping/resizing before upload
- Multiple logo variants (light/dark mode)
- Logo size optimization
- Drag-and-drop upload
- Image format conversion
- Favicon generation from logo

## Troubleshooting

### Logo not uploading
- Check file size (must be < 5MB)
- Check file type (must be an image)
- Check Supabase storage bucket exists
- Check RLS policies are applied

### Logo not displaying
- **Next.js Image Error**: If you see "hostname is not configured", make sure `next.config.ts` includes your Supabase hostname in `images.remotePatterns`
- **Restart required**: After updating `next.config.ts`, restart your dev server
- Check browser console for errors
- Verify logo URL is saved in database
- Check Supabase storage bucket is public
- Clear browser cache

### Migration errors
- Ensure Supabase CLI is installed
- Ensure project is linked: `supabase link`
- Check database connection
- Review migration file for syntax errors

## Files Modified

1. `supabase/migrations/20251127023632_add_logo_url.sql` - Database migration
2. `src/lib/hooks/use-user-profile.ts` - Added logo_url to interface
3. `src/app/settings/page.tsx` - Logo upload UI and logic
4. `src/components/layout/header.tsx` - Avatar with logo
5. `src/components/layout/sidebar.tsx` - Sidebar with logo

## Dependencies

No new dependencies were added. Uses existing:
- Next.js Image component
- Supabase storage client
- Radix UI Avatar component
- Lucide React icons

