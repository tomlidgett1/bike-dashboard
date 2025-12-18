#!/bin/bash

# Supabase Link Script
# This script helps you link your local project to your Supabase instance

echo "🔗 Linking to Supabase..."
echo ""
echo "You'll need:"
echo "1. Your project reference ID (looks like: abcd1234efgh5678)"
echo "   Find it at: https://app.supabase.com → Your Project → Settings → General"
echo ""
echo "2. Your database password"
echo "   Find it at: https://app.supabase.com → Your Project → Settings → Database"
echo ""
echo "Running supabase link..."
echo ""

supabase link

echo ""
echo "✅ Done! You can now push migrations with: supabase db push"















