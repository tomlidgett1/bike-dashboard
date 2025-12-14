# Supabase Authentication Setup Guide

## 🚀 Quick Setup

### 1. Create Environment File

Create a `.env.local` file in the root of your project:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://lvsxdoyptioyxuwvvpgb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. Get Your Supabase Anon Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `lvsxdoyptioyxuwvvpgb`
3. Navigate to **Settings** → **API**
4. Copy the `anon` `public` key
5. Paste it into your `.env.local` file

### 3. Enable Email Authentication (Supabase Dashboard)

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. Configure email templates if desired
4. Save changes

### 4. Set Up Authentication Redirect URL

1. Go to **Authentication** → **URL Configuration**
2. Add the following Site URL:
   - Development: `http://localhost:3000`
   - Production: Your production URL
3. Add the following Redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `your-production-url/auth/callback`

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` and you'll be redirected to the login page.

## 📋 What's Been Set Up

### ✅ Authentication System
- **Login Page**: Beautiful, modern authentication UI at `/login`
- **Sign Up**: Users can create accounts with email/password
- **Protected Routes**: Dashboard requires authentication
- **Middleware**: Automatic redirect to login for unauthenticated users
- **Session Management**: Automatic session refresh and persistence

### ✅ Components Created
- `AuthProvider`: React context for managing auth state
- `User Menu`: Dropdown in header with sign out functionality
- `Login Page`: Modern, responsive login/signup form

### ✅ Supabase Integration
- Client-side Supabase client for browser operations
- Server-side Supabase client for server components
- Middleware for automatic session management
- Auth callback route for OAuth flows

### ✅ Security Features
- Environment variables for sensitive keys
- Protected routes via middleware
- Secure session management
- Automatic token refresh

## 🎨 User Interface Features

### Login Page
- Clean, modern design with white background and rounded corners
- Email and password fields with icons
- Toggle between login and signup modes
- Loading states with spinners
- Error message display in white containers
- Responsive design for all devices

### Header User Menu
- User avatar with initials
- Email display
- Settings link
- Sign out button with red text
- Dropdown menu with smooth animations

## 🔐 Database Setup (Optional)

If you need to store additional user data or create database tables:

1. Go to **SQL Editor** in Supabase Dashboard
2. Create tables as needed
3. Set up Row Level Security (RLS) policies
4. Example table creation:

```sql
-- Create a profiles table
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table profiles enable row level security;

-- Create policy
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);
```

## 🧪 Testing the Setup

1. Start the dev server: `npm run dev`
2. Try to access `http://localhost:3000` → Should redirect to `/login`
3. Create a new account with an email and password
4. Check your email for confirmation (if email confirmation is enabled)
5. Sign in with your credentials
6. You should be redirected to the dashboard
7. Click your avatar in the header to see the user menu
8. Try signing out → Should redirect back to `/login`

## 🎯 Next Steps

### Optional Enhancements
1. **Email Confirmation**: Enable email confirmation in Supabase Auth settings
2. **Password Reset**: Add forgot password functionality
3. **OAuth Providers**: Enable Google, GitHub, etc. in Supabase
4. **Profile Management**: Create user profile pages
5. **Database Tables**: Set up your data models
6. **Row Level Security**: Configure RLS policies for your tables

## 🐛 Troubleshooting

### Issue: Redirecting to login even when logged in
- Check that your `.env.local` file is correctly formatted
- Ensure the Supabase URL and anon key are correct
- Clear browser cookies and localStorage
- Restart the dev server

### Issue: "Invalid API key" error
- Double-check your anon key in Supabase dashboard
- Make sure it's the `anon` `public` key, not the service role key
- Restart dev server after updating `.env.local`

### Issue: Email confirmation link not working
- Check that the redirect URL is configured in Supabase
- Verify the callback route at `/auth/callback` exists
- Check if email confirmation is required in Auth settings

## 📚 File Structure

```
bike-dashboard/
├── .env.local (create this!)
├── .env.local.example
├── middleware.ts (route protection)
├── src/
│   ├── app/
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts (OAuth callback)
│   │   ├── login/
│   │   │   └── page.tsx (login/signup page)
│   │   └── layout.tsx (includes AuthProvider)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── dashboard-layout.tsx (hides layout on auth pages)
│   │   │   └── header.tsx (user menu)
│   │   └── providers/
│   │       └── auth-provider.tsx (auth state management)
│   └── lib/
│       └── supabase/
│           ├── client.ts (browser client)
│           ├── server.ts (server client)
│           └── middleware.ts (session management)
```

## 🎉 You're All Set!

Your authentication system is now fully configured and ready to use!














