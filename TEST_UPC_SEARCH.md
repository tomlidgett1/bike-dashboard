# 🔍 Test UPC Search Query

## Check the Logs

When you click "Find More Images", look for these console logs in **Supabase Edge Function Logs**:

### Step 1: Product Info
```
📋 Product: "Specialized Rockhopper 29"
📋 UPC: 885036720304    ← Should show actual UPC
📋 Category: Mountain Bikes
📋 Manufacturer: Specialized
```

### Step 2: Search Query
```
🔍 [IMAGE SEARCH] Using UPC for precise matching: 885036720304
🔍 [IMAGE SEARCH] Final query: "885036720304 bicycle Specialized Rockhopper product photo..."
                                ^^^^^^^^^^^^^ UPC should be first!
```

## If UPC is Missing

**You'll see:**
```
🔍 [IMAGE SEARCH] Final query: "bicycle Specialized Rockhopper product photo..."
                                ^^^^^^^ No UPC!
```

**This means:**
1. Product doesn't have a UPC in database, OR
2. UPC is TEMP-xxx (ignored), OR
3. UPC isn't being passed from queue to function

## How to Check

1. Go to Supabase Dashboard
2. Navigate to: Edge Functions → process-image-discovery-queue
3. Click "Logs" tab
4. Click "Find More Images" on a product
5. Look for the search query log
6. Copy and paste what you see here

The logs will tell us if UPC is being passed correctly!






