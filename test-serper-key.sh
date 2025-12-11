#!/bin/bash

# ============================================================
# Test Serper API Key
# ============================================================

echo "🔑 Testing Serper API Key..."
echo ""

# Get API key from user
read -p "Enter your Serper API key: " SERPER_KEY

if [ -z "$SERPER_KEY" ]; then
  echo "❌ No API key provided"
  exit 1
fi

echo ""
echo "📊 Key Info:"
echo "   Length: ${#SERPER_KEY} characters"
echo "   First 8 chars: ${SERPER_KEY:0:8}..."
echo ""

# Test the API key
echo "🌐 Testing API key with Serper..."
response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST \
  https://google.serper.dev/images \
  -H "X-API-KEY: $SERPER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "bicycle helmet",
    "num": 5
  }')

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo ""

if [ "$http_status" = "200" ]; then
  echo "✅ SUCCESS! API key is valid"
  echo ""
  image_count=$(echo "$body" | grep -o '"imageUrl"' | wc -l | tr -d ' ')
  echo "📸 Found $image_count images"
  echo ""
  echo "🎉 Your Serper API key works! Now set it in Supabase:"
  echo ""
  echo "   supabase secrets set SERPER_API_KEY=$SERPER_KEY"
  echo ""
elif [ "$http_status" = "403" ]; then
  echo "❌ FAILED: 403 Unauthorized"
  echo ""
  echo "This API key is invalid. Please:"
  echo "1. Go to https://serper.dev/dashboard"
  echo "2. Log in to your account"
  echo "3. Copy the API key EXACTLY (no spaces, no quotes)"
  echo "4. Run this script again"
  echo ""
elif [ "$http_status" = "429" ]; then
  echo "⚠️  Rate limit exceeded"
  echo "Your API key works, but you've hit the rate limit."
  echo "Wait a few minutes and try again."
  echo ""
else
  echo "❌ FAILED: HTTP $http_status"
  echo ""
  echo "Response:"
  echo "$body"
  echo ""
fi











