#!/bin/bash

echo "Creating .env.local file..."

cat > .env.local << 'ENVEOF'
NEXT_PUBLIC_SUPABASE_URL=https://lvsxdoyptioyxuwvvpgb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
ENVEOF

echo "✅ .env.local file created!"
echo ""
echo "⚠️  IMPORTANT: You need to:"
echo "1. Get your anon key from: https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/settings/api"
echo "2. Replace 'your-anon-key-here' in .env.local with your actual anon key"
echo "3. Save the file"
echo ""
echo "Then run: npm run dev"
