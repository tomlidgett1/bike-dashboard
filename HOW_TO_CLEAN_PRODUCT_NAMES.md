# 🧹 AI Product Name Cleaning

This feature uses OpenAI GPT-4o-mini to automatically clean and format your product names for customer-facing display.

## What It Does

**Two powerful features in one:**
1. ✨ **Cleans product names** - Transforms raw Lightspeed descriptions into professional e-commerce display names
2. 🏷️ **Auto-categorises** - Intelligently assigns products to 3-level marketplace categories

**Before (Raw Lightspeed):**
```
Name: "trek fuel ex 98 xt 29 mtb"
Category: (manual selection required)
```

**After (AI Processed):**
```
Display Name: "Trek Fuel EX 9.8 XT 29" Mountain Bike"
Category: Bicycles > Mountain > Trail
```

### More Examples

| Before | After | Categories |
|--------|-------|------------|
| `SHIMANO DEORE XT M8100 12-SPD RD` | `Shimano Deore XT M8100 12-Speed Rear Derailleur` | Drivetrain > Derailleurs > Rear |
| `specialized s-works carbon helmet blk/red size L` | `Specialized S-Works Carbon Helmet Black/Red - Large` | Accessories > Helmets |
| `Giant TCR Advanced Pro 1 2023` | `Giant TCR Advanced Pro 1 2023` | Bicycles > Road |

## How to Run Manually

### Option 1: Using the API (Recommended)

```bash
# Make a POST request to the clean-names endpoint
curl -X POST http://localhost:3000/api/products/clean-names \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "batchSize": 20,
    "limit": 100
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Cleaned 85 product names",
  "stats": {
    "total": 100,
    "cleaned": 85,
    "failed": 15
  },
  "results": [...]
}
```

### Option 2: Direct Edge Function Call

```bash
# Get your Supabase access token from your browser's dev tools (Application > Cookies)
curl -X POST https://your-project.supabase.co/functions/v1/clean-product-names \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "batchSize": 20,
    "limit": 100
  }'
```

### Option 3: From Supabase Dashboard

1. Go to **Edge Functions** in your Supabase Dashboard
2. Find `clean-product-names` function
3. Click **Invoke Function**
4. Add authentication header with your access token
5. Set request body:
   ```json
   {
     "userId": "your-user-id",
     "batchSize": 20,
     "limit": 100
   }
   ```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `batchSize` | number | 20 | Number of products to process in each batch |
| `limit` | number | 100 | Maximum total products to clean in one run |
| `userId` | string | (auto) | User ID to filter products (auto-set in API route) |

## How It Works

1. **Fetches uncleaned products** - Products where `cleaned = false`
2. **Batches them** - Processes 20 at a time to avoid rate limits
3. **Sends to GPT-4o-mini** - AI cleans the names with smart formatting
4. **Updates database** - Sets `display_name` and marks `cleaned = true`
5. **Returns stats** - Shows success/failure counts

## Database Schema

### New Columns in `products` Table:

```sql
-- AI-cleaned product name for customer display
display_name TEXT

-- Flag indicating if name has been cleaned
cleaned BOOLEAN DEFAULT false

-- Marketplace categories (3-level hierarchy)
marketplace_category TEXT
marketplace_subcategory TEXT
marketplace_level_3_category TEXT
```

### Category Hierarchy Examples:

- **Bicycles** > Mountain > Trail
- **E-Bikes** > E-MTB > Full Suspension
- **Drivetrain** > Derailleurs > Rear
- **Accessories** > Lights > Front
- **Apparel** > Shoes > Road
- **Wheels & Tyres** > Tyres > MTB

### How Display Names Work:

- **Marketplace**: Shows `display_name` if available, falls back to `description`
- **Original data**: `description` field preserves raw Lightspeed data
- **Cleaning status**: `cleaned` flag tracks which products have been processed

## Checking Status

Get cleaning stats for your account:

```bash
curl http://localhost:3000/api/products/clean-names
```

**Response:**
```json
{
  "total": 500,
  "cleaned": 350,
  "uncleaned": 150
}
```

## AI Processing Rules

### Name Cleaning:
1. ✅ **Proper Capitalisation** - First letter of each significant word capitalised
2. ✅ **Remove Internal Codes** - Strips SKU numbers and internal jargon
3. ✅ **Fix Abbreviations** - Expands "MTB" → "Mountain Bike", "RD" → "Rear Derailleur"
4. ✅ **Clean Punctuation** - Removes excessive punctuation
5. ✅ **Keep Important Details** - Preserves brand names, model numbers, specs
6. ✅ **Customer-Friendly** - Makes it readable and professional
7. ✅ **Concise** - Keeps under 80 characters when possible
8. ✅ **Australian Spelling** - Uses "colour" not "color"

### Auto-Categorization:
1. 🎯 **3-Level Taxonomy** - Assigns to Level 1 > Level 2 > Level 3 (or null)
2. 🔍 **Context-Aware** - Analyses product name, description, and existing category
3. 📊 **120+ Categories** - Covers complete bikes, e-bikes, components, apparel, accessories, nutrition, and services
4. ✨ **Intelligent Matching** - Chooses the most specific category that fits
5. 🚴 **Bike-Specific** - Distinguishes XC, Trail, Enduro, Downhill MTB variants
6. ⚡ **E-Bike Support** - Separate category tree for electric bikes

## Fallback Behavior

If the AI API fails or is unavailable, the function uses basic cleaning:

```typescript
// Fallback: Basic capitalisation + trimming
"trek fuel ex 98" → "Trek Fuel Ex 98"
```

This ensures products always get some level of cleaning even if OpenAI is down.

## Cost

- **Model**: GPT-4o-mini
- **Cost**: ~$0.15 per 1,000 products (very cheap!)
- **Tokens**: ~50 tokens per product (average)
- **Batch size**: 20 products per API call

**Example:**
- 1,000 products = ~50,000 tokens
- Cost: ~$0.15 USD
- Time: ~2-3 minutes (with rate limiting)

## Re-running

To re-clean products:

```sql
-- Reset cleaned flag for all products
UPDATE products SET cleaned = false WHERE user_id = 'your-user-id';
```

Then run the cleaning function again.

## Troubleshooting

### No products being cleaned?

Check if you have uncleaned products:
```sql
SELECT COUNT(*) FROM products WHERE cleaned = false;
```

### API errors?

Ensure `OPENAI_API_KEY` is set in Supabase secrets:
1. Go to Supabase Dashboard → Settings → Edge Functions
2. Add secret: `OPENAI_API_KEY` = `sk-...`

### Display names not showing?

The marketplace automatically uses `display_name` if available. If not showing:
1. Check database: `SELECT display_name FROM products LIMIT 10`
2. Verify `cleaned = true` for those products
3. Check browser cache - do a hard refresh

## Next Steps

After cleaning product names:

1. ✅ **Review results** - Check a few display names in the marketplace
2. ✅ **Re-run if needed** - Adjust any products that need manual tweaking
3. ✅ **Automate** - Set up to run after each Lightspeed sync (future feature)

## 📋 Complete Category Taxonomy

The AI uses this comprehensive 3-level taxonomy (120+ categories):

**Bicycles**: Road, Gravel, Mountain (XC/Trail/Enduro/Downhill), Hybrid/Fitness, Commuter/City, Folding, Cargo, Touring, Track/Fixie, Cyclocross, Time Trial/Triathlon, BMX (Race/Freestyle), Kids (Balance/12-16"/20-24")

**E-Bikes**: E-Road, E-Gravel, E-MTB (Hardtail/Full Suspension), E-Commuter/City, E-Hybrid, E-Cargo, E-Folding

**Frames & Framesets**: Road, Gravel, MTB Hardtail, MTB Full Suspension, E-Bike Frame, Other Frames

**Wheels & Tyres**: Road/Gravel/MTB Wheelsets, Tyres (Road/Gravel/MTB), Tubes, Tubeless (Sealant/Valves/Tape)

**Drivetrain**: Groupsets, Cranksets, Cassettes, Derailleurs (Front/Rear), Chains, Bottom Brackets, Power Meters

**Brakes**: Disc Brakes (Complete/Calipers/Rotors), Brake Pads, Levers

**Cockpit**: Handlebars (Road/MTB/Gravel), Stems, Headsets, Bar Tape & Grips

**Seat & Seatposts**: Saddles, Seatposts, Dropper Posts

**Pedals**: Clipless, Flat, Accessories

**Accessories**: Helmets, Lights (Front/Rear/Sets), Pumps (Floor/Mini), Locks, Bags (On-Bike/Off-Bike), Racks & Panniers, Mudguards, Bottles & Cages, Child Seats & Trailers, Car Racks

**Apparel**: Jerseys, Shorts & Bibs, Jackets & Gilets, Gloves, Shoes (Road/MTB), Casual Clothing

**Protection**: Knee & Elbow Pads, Body Armor

**Maintenance & Workshop**: Tools, Cleaning, Lubricants & Grease, Repair Kits, Workstands

**Tech & Electronics**: Bike Computers, Smart Trainers, Heart Rate Monitors, Cameras, E-Bike Batteries & Chargers

**Nutrition**: Energy Gels & Chews, Bars, Drink Mixes & Electrolytes

**Shop Services**: Bike Service (Basic/Intermediate/Premium), Bike Fitting, Suspension Service

**Marketplace Specials**: Verified Bikes, Certified Pre-Owned, Clearance

---

**Questions?** Check the Edge Function logs in Supabase Dashboard for detailed execution info.

