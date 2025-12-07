const fetch = require('node-fetch');

// Lightspeed API configuration
const API_BASE_URL = 'https://api.lightspeedapp.com/API/V3';

async function testStockQuery() {
  console.log('🧪 Testing Lightspeed API - Items with Positive Stock\n');
  
  // Read environment variables
  const fs = require('fs');
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  });

  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing Supabase credentials');
    return;
  }

  // Get the current user's Lightspeed connection
  console.log('📡 Fetching Lightspeed access token from database...');
  
  const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/lightspeed_connections?select=*&status=eq.connected`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  });

  const connections = await supabaseResponse.json();
  
  if (!connections || connections.length === 0) {
    console.error('❌ No active Lightspeed connections found');
    return;
  }

  console.log(`✅ Found ${connections.length} connection(s)\n`);
  
  // For now, just test if we can construct the query
  console.log('📋 Testing Lightspeed API Query Options:\n');
  
  console.log('Option 1: Query Items with Stock Filter');
  console.log('  Endpoint: GET /Item.json');
  console.log('  Parameters: ?qoh=>,0&load_relations=["ItemShops"]');
  console.log('  Note: Lightspeed filters items where qoh (quantity on hand) > 0');
  console.log('  Rate Limit: 5 requests/second (Bucket API)');
  console.log('  Max Results: 100 per page (requires pagination)\n');
  
  console.log('Option 2: Query ItemShops (Inventory by Location)');
  console.log('  Endpoint: GET /ItemShop.json');
  console.log('  Parameters: ?qoh=>,0');
  console.log('  Note: Returns item_id + shop_id + stock for each location');
  console.log('  Rate Limit: 5 requests/second');
  console.log('  Max Results: 100 per page\n');
  
  console.log('Option 3: Use Account Endpoint to Get Total Item Count First');
  console.log('  Step 1: GET /Account.json to see total items');
  console.log('  Step 2: Calculate pagination needed');
  console.log('  Step 3: Fetch in batches with rate limiting\n');
  
  console.log('⚡ Rate Limiting Strategy:');
  console.log('  - Lightspeed allows 5 requests/second');
  console.log('  - For 1000 items @ 100/page = 10 requests = 2 seconds');
  console.log('  - For 10000 items @ 100/page = 100 requests = 20 seconds');
  console.log('  - Built-in rate limiter in LightspeedClient handles this\n');
  
  console.log('🎯 Recommended Approach:');
  console.log('  1. Use ItemShop endpoint with qoh filter');
  console.log('  2. Paginate through results (100 at a time)');
  console.log('  3. Extract unique item IDs');
  console.log('  4. Return count of unique items with stock\n');
  
  console.log('Would you like me to:');
  console.log('  A) Test the actual API call (requires decrypting tokens)');
  console.log('  B) Create a full implementation in the codebase');
  console.log('  C) Show you the exact API endpoint to test manually\n');
}

testStockQuery().catch(console.error);
