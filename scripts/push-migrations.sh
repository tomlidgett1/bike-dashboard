#!/bin/bash

# Push Database Migrations Script
# This script pushes all pending migrations to your Supabase database

echo "🚀 Pushing migrations to Supabase..."
echo ""

# Check if linked
if [ ! -f ".git/config" ]; then
  echo "⚠️  Not linked to Supabase yet."
  echo "Run: ./scripts/link-supabase.sh first"
  exit 1
fi

echo "📦 Migrations to be applied:"
ls -1 supabase/migrations/
echo ""

read -p "Continue? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
  supabase db push
  echo ""
  echo "✅ Migrations pushed successfully!"
  echo ""
  echo "💡 Tip: You can generate TypeScript types with:"
  echo "   supabase gen types typescript --linked > src/lib/database.types.ts"
else
  echo "Cancelled."
fi







