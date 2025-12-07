# Instagram Posts Feature - Implementation Complete ✅

## Overview

A complete admin feature to select marketplace listings, generate branded Instagram images with text overlays, and automatically post them to Instagram via **Make.com automation**.

## What Was Built

### 1. Database Migration ✅
- **File**: `supabase/migrations/20251206111126_create_instagram_posts_table.sql`
- Creates `instagram_posts` table to track all Instagram posts
- Includes status tracking (pending, processing, posted, failed)
- Stores Cloudinary image URLs and Make.com execution IDs
- RLS policies configured for admin access

### 2. Cloudinary Text Overlay Service ✅
- **File**: `src/lib/services/cloudinary-overlay.ts`
- Generates Instagram-optimized images (1080x1080, 1:1 aspect ratio)
- **Title overlay**: Top-left, bold yellow (#FFD700), 60px font
- **Price overlay**: Bottom-left, bold yellow (#FFD700), 80px font
- Both overlays have black stroke for visibility on any background
- Handles non-Cloudinary images via fetch URL

### 3. Make.com Webhook Client ✅
- **File**: `src/lib/services/instagram-client.ts`
- **Simplest approach**: Just sends data to Make.com webhook
- Make.com handles all Instagram posting logic
- No complex API authentication needed
- Features:
  - Send payload to webhook
  - Validate webhook URL
  - Send test payloads
- Auto-generates captions: "[Title] / $[Price] - live now on Yellow Jersey 🚴‍♂️"

### 4. API Routes ✅

#### Generate Image API
- **File**: `src/app/api/instagram/generate-image/route.ts`
- **Endpoint**: `POST /api/instagram/generate-image`
- Fetches product from database
- Generates title from brand + model (or description)
- Creates Cloudinary transformation URL with overlays
- Returns branded image URL

#### Post to Instagram API
- **File**: `src/app/api/instagram/post/route.ts`
- **Endpoint**: `POST /api/instagram/post`
- **Endpoint**: `GET /api/instagram/post?productId={id}` (check post history)
- Sends data to Make.com webhook
- Make.com scenario posts to Instagram
- Saves execution record to database
- Returns Make.com execution URL

### 5. Admin UI Page ✅
- **File**: `src/app/admin/instagram-posts/page.tsx`
- **URL**: `/admin/instagram-posts`
- Beautiful, modern interface with:
  - Searchable product list (by name, brand, model)
  - Product cards with images, titles, prices
  - Selection system (multi-select)
  - "Ready to Post" sidebar showing selected products
  - Real-time status indicators:
    - Generating image...
    - Posting to Instagram...
    - Posted successfully!
    - Error states with retry button
  - Setup instructions for Make.com webhook

### 6. Navigation Updates ✅
- **File**: `src/components/layout/sidebar.tsx`
- Added "Admin" section to sidebar
- Instagram Posts link with Instagram icon
- Also added Image QA link to admin section
- Available on both desktop and mobile navigation

## Setup Instructions

### Part 1: Create Make.com Scenario

#### Step 1: Create Make.com Account
1. Go to [make.com](https://www.make.com/)
2. Sign up for free account
3. Log in to dashboard

#### Step 2: Create New Scenario
1. Click "Create a new scenario"
2. Name it: "Instagram Post Publisher"

#### Step 3: Add Webhook Trigger
1. Click the **+** button to add first module
2. Search for "Webhooks"
3. Select **"Custom webhook"**
4. Click **"Create a webhook"**
5. Name it: "Instagram Listing Webhook"
6. Click **"Save"**
7. **COPY THE WEBHOOK URL** - you'll need this!

Example webhook URL:
```
https://hook.eu1.make.com/abcdef123456789
```

#### Step 4: Add Instagram Module
1. Click **+** to add next module
2. Search for "Instagram"
3. Select **"Instagram for Business"**
4. Choose action: **"Create a Post"**
5. Click **"Create a connection"**
6. Follow prompts to connect your Instagram Business account
7. Configure the post:
   - **Instagram Business Account**: Select your account
   - **Image URL**: Map from webhook → `imageUrl`
   - **Caption**: Map from webhook → `caption`
   - **Location**: (optional)

#### Step 5: Add Error Handling (Optional)
1. Right-click on Instagram module
2. Select "Add error handler"
3. Add "Email" or "Slack" module to notify you of failures

#### Step 6: Save and Activate
1. Click **"Save"** (floppy disk icon)
2. Toggle scenario to **"ON"** (active)
3. Your scenario is now live!

### Part 2: Configure Your Application

#### Step 1: Add Webhook URL to Environment
Add to your `.env.local`:

```bash
MAKE_WEBHOOK_URL=https://hook.eu1.make.com/YOUR_WEBHOOK_ID
```

Replace with the webhook URL you copied from Step 3 above.

#### Step 2: Restart Your Dev Server
```bash
# Stop the current server (Ctrl+C)
# Then restart
npm run dev
```

### Part 3: Test the Integration

#### Step 1: Navigate to Admin Page
- Go to `http://localhost:3000/admin/instagram-posts`

#### Step 2: Select a Product
- Search for a product
- Click "Select" button
- Product appears in "Ready to Post" panel

#### Step 3: Post to Instagram
- Click "Post to Instagram" button
- Watch the status:
  - ✅ Generating Instagram image...
  - ✅ Posting to Instagram...
  - ✅ Posted successfully!

#### Step 4: Verify in Make.com
- Go to your Make.com dashboard
- Click on your scenario
- View "Executions" tab
- You should see the successful run!

#### Step 5: Check Instagram
- Go to your Instagram Business account
- The post should appear in your feed!

## How It Works

### The Complete Flow

```
1. User selects product in admin UI
2. Frontend calls /api/instagram/generate-image
3. API generates Cloudinary URL with overlays
4. Frontend calls /api/instagram/post with image URL
5. API sends data to Make.com webhook:
   {
     "productId": "123",
     "title": "Trek Domane SL6",
     "price": 4299.00,
     "imageUrl": "https://res.cloudinary.com/...",
     "caption": "Trek Domane SL6 / $4,299.00 - live now...",
     "description": "High-performance carbon road bike..."
   }
6. Make.com receives webhook trigger
7. Make.com scenario executes
8. Instagram module posts to Instagram
9. Post appears on your Instagram feed!
```

### Make.com Scenario Structure

```
┌──────────────┐
│   Webhook    │ ← Receives data from your app
│   Trigger    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Instagram   │ ← Posts to Instagram
│    Module    │
└──────┬───────┘
       │
       ▼
   ✅ Success!
```

## Why Make.com is the Best Choice

### ✅ Compared to Instagram Graph API

**Instagram Graph API (Complex):**
- ❌ Requires Facebook Developer account
- ❌ Requires Facebook Business Manager
- ❌ Requires Facebook Page
- ❌ Complex OAuth flow
- ❌ 2-step posting process
- ❌ Rate limit management needed
- ❌ Complex error handling

**Make.com (Simple):**
- ✅ Just create a scenario
- ✅ Connect Instagram once
- ✅ One webhook call
- ✅ Make.com handles all complexity
- ✅ Built-in error handling
- ✅ Visual workflow editor
- ✅ Free tier available

### ✅ Compared to Buffer API

**Buffer (API-based):**
- ⚠️ Requires Buffer account
- ⚠️ API authentication needed
- ⚠️ Profile ID management
- ⚠️ Queue management
- ⚠️ Limited to Buffer's features

**Make.com (Workflow-based):**
- ✅ More flexible workflows
- ✅ Can add conditional logic
- ✅ Can post to multiple platforms
- ✅ Can add notifications, logging, etc.
- ✅ Visual debugging
- ✅ Can integrate with other services

### Key Advantages

1. **No Authentication Complexity**: Just a webhook URL
2. **Visual Editor**: See and modify your workflow
3. **Error Handling**: Built-in retry and error notifications
4. **Extensibility**: Easy to add more steps (e.g., post to Twitter, save to spreadsheet)
5. **Testing**: Test your scenario before going live
6. **Monitoring**: See all executions and debug easily
7. **Free Tier**: 1,000 operations/month free

## Advanced Features

### Add Multiple Platforms

You can easily extend your Make.com scenario to post to multiple platforms:

1. After Instagram module, click **+**
2. Add **Twitter** module
3. Use same `caption` and `imageUrl`
4. Now you post to Instagram AND Twitter simultaneously!

### Add Scheduling

1. Before Instagram module, add **"Tools" → "Sleep"**
2. Set delay (e.g., 1 hour)
3. Post will be queued and published later

### Add Notifications

1. After Instagram module, add **"Email"** or **"Slack"**
2. Map webhook data
3. Send success notification with post details

### Add Data Storage

1. After Instagram module, add **"Google Sheets"**
2. Log every post: timestamp, product, Instagram URL
3. Build analytics dashboard

## Technical Details

### Webhook Payload Structure

Your app sends this JSON to Make.com:

```json
{
  "productId": "uuid-here",
  "title": "Trek Domane SL6",
  "price": 4299.00,
  "imageUrl": "https://res.cloudinary.com/.../image.jpg",
  "caption": "Trek Domane SL6 / $4,299.00 - live now on Yellow Jersey 🚴‍♂️\n\nShop now at yellowjersey.com.au\n\n#cycling #bike...",
  "description": "High-performance carbon road bike with endurance geometry..."
}
```

### Cloudinary Image Transformation

Images are transformed with this URL pattern:
```
https://res.cloudinary.com/{cloud_name}/image/upload/
c_fill,ar_1:1,g_auto,w_1080,h_1080/
l_text:Arial_60_bold:{title},co_rgb:FFD700,g_north_west,x_30,y_30,bo_3px_solid_rgb:000000/
l_text:Arial_80_bold:{price},co_rgb:FFD700,g_south_west,x_30,y_30,bo_4px_solid_rgb:000000/
{public_id}
```

### Database Tracking

Every post is tracked in the `instagram_posts` table:
- Product ID (linked to products table)
- Cloudinary image URL
- Make.com scenario execution ID
- Status (pending → processing → posted/failed)
- Timestamps
- Error messages (if failed)

## Troubleshooting

### "Make.com webhook URL not configured"
**Solution**: Add `MAKE_WEBHOOK_URL` to your `.env.local` file

### Webhook triggered but nothing posted
**Check**:
1. Is your Make.com scenario "ON" (active)?
2. Is your Instagram account connected in the scenario?
3. Check the scenario's "Executions" tab for errors
4. Verify Instagram account is a Business account

### "Invalid webhook URL format"
**Solution**: 
- URL should start with `https://hook.`
- Format: `https://hook.eu1.make.com/xxxxx`
- No extra spaces or characters

### Posts not appearing immediately
**Note**: 
- Instagram may take a few moments to publish
- Check Make.com executions to verify it ran
- Check Instagram Business Suite for post status

### Make.com scenario fails
**Debug**:
1. Click on failed execution in Make.com
2. View error details
3. Common issues:
   - Image URL not publicly accessible
   - Caption too long (max 2,200 characters)
   - Instagram account not connected properly

## Testing

### Test Without Posting to Instagram

During development, you can test without actually posting:

1. In Make.com scenario
2. Replace Instagram module with **"Webhook Response"**
3. Or add **"Email"** module to email yourself the data
4. This lets you test the data flow without posting

### Test with Test Account

1. Create an Instagram test account
2. Connect it to Make.com
3. Test posts go to test account
4. Switch to real account when ready

## What's Next

Now you can:
1. ✅ Create Make.com account
2. ✅ Create scenario with webhook trigger
3. ✅ Connect Instagram Business account
4. ✅ Copy webhook URL
5. ✅ Add to `.env.local`
6. ✅ Visit `/admin/instagram-posts`
7. ✅ Start posting with one click!

The system will automatically:
- Generate beautiful branded images
- Add yellow text overlays (title + price)
- Create engaging captions with hashtags
- Send to Make.com webhook
- Make.com posts to Instagram
- Track everything in your database

## Example Make.com Scenario Export

If needed, here's the JSON structure for your scenario:

```json
{
  "name": "Instagram Post Publisher",
  "flow": [
    {
      "id": 1,
      "module": "webhooks:CustomWebhook",
      "version": 1,
      "parameters": {},
      "mapper": {},
      "metadata": {}
    },
    {
      "id": 2,
      "module": "instagram:createPost",
      "version": 1,
      "parameters": {
        "account": "{{1.productId}}"
      },
      "mapper": {
        "imageUrl": "{{1.imageUrl}}",
        "caption": "{{1.caption}}"
      },
      "metadata": {}
    }
  ]
}
```

---

**Implementation completed successfully with Make.com!** 🎉

Make.com provides the simplest, most flexible solution for Instagram posting without dealing with complex API authentication.
