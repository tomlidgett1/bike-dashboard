# 🔤 Keyword-Based Recommendations - How It Works

## ✅ **Now Implemented!**

Your recommendation system now extracts and matches keywords from product names, even if structured fields like `manufacturer_name` are empty.

---

## 📖 **Plain English Explanation:**

### **Your Shimano Example:**

**Scenario:** You keep clicking on Shimano products. The `manufacturer_name` field is empty, but "Shimano" appears in every product title.

---

### **What Happens Now:**

**STEP 1: You Browse**
- Click: "Shimano Deore XT M8100 Cassette"
- Click: "Shimano XTR Hydraulic Brake"
- Click: "Shimano 105 Groupset Black"
- View: "Shimano Chain 11-Speed"

**STEP 2: System Extracts Keywords** (Automatic)

The system analyzes all the product names you clicked and:

1. **Splits into words:**
   - ["Shimano", "Deore", "XT", "M8100", "Cassette"]
   - ["Shimano", "XTR", "Hydraulic", "Brake"]
   - ["Shimano", "105", "Groupset", "Black"]
   - ["Shimano", "Chain", "11-Speed"]

2. **Counts frequency:**
   - "Shimano" → 4 times ⭐⭐⭐⭐
   - "Deore" → 1 time
   - "Hydraulic" → 1 time
   - "Cassette" → 1 time
   - "Brake" → 1 time

3. **Filters out junk:**
   - Ignores: "the", "and", "with", "from"
   - Ignores: Short words (< 4 characters)
   - Keeps: Technical terms, brand names, product types

4. **Stores top keywords:**
```json
{
  "favorite_keywords": [
    { "keyword": "shimano", "score": 4 },
    { "keyword": "hydraulic", "score": 1 },
    { "keyword": "cassette", "score": 1 },
    { "keyword": "deore", "score": 1 }
  ]
}
```

**STEP 3: Recommendations Generated**

When you visit For You page, the keyword algorithm:

1. **Searches ALL products** for your top 5 keywords
2. **Finds matches:**
   - "Shimano SLX Derailleur" → Contains "shimano" → Score: 4
   - "Shimano Deore Shifter" → Contains "shimano" + "deore" → Score: 5
   - "SRAM Cassette" → No matches → Score: 0 (filtered out)

3. **Ranks by keyword relevance:**
   - Products with more keyword matches rank higher
   - Products matching high-frequency keywords (like "shimano") rank higher

4. **Combines with other algorithms:**
   - Keyword matches (weight: 0.95) ← Very high priority!
   - Trending (weight: 1.0)
   - Category-based (weight: 0.9)
   - Similar products (weight: 0.85)
   - Collaborative (weight: 0.8)

---

## 🎯 **Real Example:**

### **You Click These 5 Products:**
1. "Shimano Deore XT Cassette 12-Speed" - $200
2. "Shimano XT Brake Set Hydraulic" - $350
3. "Shimano Chain HG-X12" - $45
4. "Trek Mountain Bike Frame" - $800
5. "Shimano Deore Shifter" - $120

### **Keywords Extracted:**
```
"shimano" → 4 clicks (highest!)
"deore" → 2 clicks
"hydraulic" → 1 click
"cassette" → 1 click
"brake" → 1 click
"trek" → 1 click
"mountain" → 1 click
```

### **For You Page Will Show:**

**Top recommendations (keyword matches highlighted):**
1. **Shimano** SLX M7100 **Cassette** - $180 (matches 2 keywords!)
2. **Shimano Deore** M6100 Derailleur - $95 (matches 2 keywords!)
3. **Shimano** XTR **Hydraulic** **Brake** - $450 (matches 3 keywords!)
4. **Trek** Fuel EX Frame - $900 (matches 1 keyword)
5. SRAM Eagle **Cassette** - $220 (matches 1 keyword)

Even though manufacturer_name is empty, it finds "Shimano" products by matching the word in the title!

---

## 🔍 **How Keyword Matching Works Technically:**

### **Extraction (Every time preferences update):**
```
User clicks product →
Function scans: display_name + description →
Splits into words →
Filters out: "the", "and", "with", short words →
Counts frequency →
Stores top 30 keywords
```

### **Matching (When generating recommendations):**
```
Get user's top 5 keywords →
Search products: WHERE (display_name LIKE '%shimano%' OR description LIKE '%shimano%') →
Score each product: How many keywords match × keyword frequency →
Return top matches
```

### **Ranking (Final recommendations):**
```
Product A: Has keyword "shimano" (appears 4 times in user history)
  → Keyword score: 4

Product B: Has "shimano" + "deore" (4 + 2 = 6 total)
  → Keyword score: 6 (ranks higher!)

Product C: Has "sram" (not in user's keywords)
  → Keyword score: 0 (filtered out)
```

---

## 🧪 **Test It Now:**

### **Step 1: Browse More Products**

Click on 5-10 products with common brands/keywords:
- Multiple Shimano products
- Multiple Trek products  
- Multiple hydraulic brakes

### **Step 2: Update Your Preferences**

Run in Supabase SQL Editor:
```sql
-- Find your user ID
SELECT id FROM auth.users WHERE email = 'your@email.com';

-- Update preferences (replace YOUR_USER_ID)
SELECT update_user_preferences_from_interactions('YOUR_USER_ID'::UUID);

-- Check extracted keywords
SELECT favorite_keywords FROM user_preferences WHERE user_id = 'YOUR_USER_ID'::UUID;
```

You should see keywords like `["shimano", "hydraulic", "trek"]`!

### **Step 3: Clear Cache and Test**

```sql
DELETE FROM recommendation_cache WHERE user_id = 'YOUR_USER_ID'::UUID;
```

Then visit `/for-you` and click Refresh - should show more Shimano products!

---

## 📊 **Algorithm Priority Now:**

1. **Trending** (1.0) - What's hot overall
2. **Keyword-based** (0.95) - Matches words in titles ← NEW!
3. **Category-based** (0.9) - Your favorite categories
4. **Similar products** (0.85) - Like what you viewed
5. **Collaborative** (0.8) - What similar users liked
6. **Popular** (0.7) - Overall best sellers

Keyword matching is now the **2nd highest priority** after trending!

---

## 🎉 **What This Solves:**

**Before:**
- ❌ If `manufacturer_name` empty → Can't recommend by brand
- ❌ No text analysis of product titles
- ❌ Misses patterns in product names

**After:**
- ✅ Extracts "Shimano", "Trek", "Giant" from ANY product title
- ✅ Works even with incomplete product data
- ✅ Learns technical terms ("hydraulic", "carbon", "12-speed")
- ✅ Smarter recommendations based on actual product content

---

## 🚀 **System Status:**

✅ **Keyword extraction** - Automatically learns from titles  
✅ **Keyword storage** - Saved in user_preferences table  
✅ **Keyword algorithm** - 6th algorithm added (0.95 weight)  
✅ **Edge function updated** - Deployed with keyword support  
✅ **Frontend ready** - No changes needed, works automatically  

**The system now considers keywords from product names!** 🎯






