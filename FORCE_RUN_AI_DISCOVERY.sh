#!/bin/bash

# ============================================================
# Force Run AI Discovery - Manual Execution Script
# ============================================================
# Use this to manually trigger AI image discovery without waiting for pg_cron

# Configuration
SUPABASE_URL="https://lvsxdoyptioyxuwvvpgb.supabase.co"
SERVICE_KEY="YOUR_SERVICE_KEY_HERE"  # Replace with actual service key

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   AI Image Discovery - Manual Execution${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"

# Check if service key is set
if [ "$SERVICE_KEY" = "YOUR_SERVICE_KEY_HERE" ]; then
  echo -e "${RED}❌ ERROR: Please edit this script and add your Supabase service key${NC}"
  echo -e "${YELLOW}   Get it from: Supabase Dashboard → Settings → API → service_role key${NC}\n"
  exit 1
fi

# Call queue processor
echo -e "${BLUE}🔄 Calling queue processor...${NC}\n"

response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST \
  "${SUPABASE_URL}/functions/v1/process-image-discovery-queue" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}')

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

if [ "$http_status" = "200" ]; then
  echo -e "${GREEN}✅ Success!${NC}\n"
  echo -e "${BLUE}Response:${NC}"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo -e "${RED}❌ Failed with status: $http_status${NC}\n"
  echo -e "${RED}Response:${NC}"
  echo "$body"
fi

echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}💡 Tips:${NC}"
echo -e "   - Check Supabase Functions logs for detailed output"
echo -e "   - View at: ${SUPABASE_URL/https:\/\//https://supabase.com/dashboard/project/}/functions"
echo -e "   - Queue processes 10 items at a time"
echo -e "   - Each product takes 30-90 seconds"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"








