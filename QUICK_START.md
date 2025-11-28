# ⚡ Quick Start Guide

## 🚀 Get Started in 2 Minutes

### 1️⃣ Create `.env.local`
```bash
NEXT_PUBLIC_SUPABASE_URL=https://lvsxdoyptioyxuwvvpgb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2️⃣ Get Your Key
Visit: https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/settings/api

Copy the **anon/public** key and paste it in `.env.local`

### 3️⃣ Enable Email Auth
Visit: https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/auth/providers

Toggle on "Email" provider

### 4️⃣ Start Dev Server
```bash
npm run dev
```

### 5️⃣ Test It
1. Visit http://localhost:3000
2. You'll be redirected to `/login`
3. Create an account
4. Sign in
5. See the dashboard! 🎉

---

## 📋 What You Get

✅ Login/signup page  
✅ Protected routes  
✅ User menu with sign out  
✅ Session management  
✅ Beautiful, modern UI  
✅ Fully responsive  

---

## 🆘 Need Help?

See detailed guides:
- `SETUP_CHECKLIST.md` - Step-by-step checklist
- `AUTH_SUMMARY.md` - Complete documentation
- `SUPABASE_SETUP.md` - Detailed Supabase guide

---

## 🎯 Common Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run production server
npm start

# Create .env.local file (helper script)
./create-env.sh
```

