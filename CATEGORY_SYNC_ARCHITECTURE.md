# Category Sync Architecture

## Overview
This document explains how the category-based product synchronisation system works, including database design, API architecture, and UI flow.

## Database Design

### Table: `lightspeed_category_sync_preferences`
Stores which Lightspeed categories each user wants to sync.

**Key Columns:**
- `category_id` (TEXT): Lightspeed's stable category identifier - **THIS IS THE SOURCE OF TRUTH**
- `category_name` (TEXT): Display name, can change in Lightspeed, updated on each sync
- `category_path` (TEXT): Full hierarchical path (e.g., "Bikes > Road Bikes")
- `is_enabled` (BOOLEAN): Whether this category should be synced
- `last_synced_at` (TIMESTAMPTZ): When products in this category were last synced
- `product_count` (INTEGER): How many products are in this category

**Why this design?**
- Uses `category_id` as the stable reference (Lightspeed category IDs don't change)
- Stores `category_name` for display purposes, but references by ID
- If a category name changes in Lightspeed, we update the name but keep the same ID
- Prevents issues with renamed categories

### Products Table Enhancement
Added columns to `products` table:
- `category_id`: Links to Lightspeed category
- `category_name`: Display name
- `category_path`: Full path for hierarchical display

## API Architecture

### GET `/api/lightspeed/categories-sync`
**Purpose:** Fetch all Lightspeed categories and merge with user's sync preferences

**Response:**
```json
{
  "categories": [
    {
      "categoryId": "123",
      "name": "Bikes",
      "fullPath": "Bikes",
      "isEnabled": true,
      "lastSyncedAt": "2025-11-27T12:00:00Z",
      "productCount": 45,
      "hasPreference": true
    }
  ],
  "totalCategories": 7,
  "enabledCount": 3
}
```

**Flow:**
1. Fetches all categories from Lightspeed API
2. Fetches user's preferences from database
3. Merges them together:
   - If category has a preference, use `is_enabled` value
   - If no preference exists, defaults to `false` (not enabled)
4. Returns unified list with status

### POST `/api/lightspeed/categories-sync`
**Purpose:** Save user's category sync preferences

**Request:**
```json
{
  "categories": [
    {
      "categoryId": "123",
      "name": "Bikes",
      "fullPath": "Bikes",
      "isEnabled": true
    }
  ]
}
```

**Flow:**
1. Receives array of categories with their enabled status
2. Upserts each category preference to database
3. Uses `ON CONFLICT (user_id, category_id)` to update existing or insert new
4. Returns updated preferences

## UI/UX Flow

### Clear Separation: Configuration vs Execution

**1. Sync Settings Section (CONFIGURATION)**
- Shows all categories from Lightspeed
- Checkboxes to enable/disable each category
- Shows status: "3 categories enabled"
- Quick actions: "Enable All" / "Disable All"
- **"Save Configuration" button** - Saves preferences to database
- Changes only take effect AFTER saving

**2. Sync Your Inventory Section (EXECUTION)**
- Shows current configuration status
- Displays: "3 categories configured"
- Shows last sync time
- **"Start Sync" button** - Performs sync using saved configuration
- Disabled if no categories are configured
- Redirects to `/sync-inventory` for guided workflow

### User Flow

1. **Initial Setup:**
   - User connects to Lightspeed
   - System fetches all available categories
   - All categories default to disabled

2. **Configuration:**
   - User opens "Sync Settings" section
   - Clicks "Show Categories" to expand list
   - Selects desired categories (e.g., Bikes, Accessories)
   - Clicks "Save Configuration"
   - Settings are saved to database

3. **Execution:**
   - User sees "2 categories configured" in Sync Inventory section
   - Clicks "Start Sync"
   - System syncs ONLY products from enabled categories
   - Only products with stock > 0 are synced

4. **Future Syncs:**
   - User can change configuration anytime
   - New configuration takes effect on next sync
   - Historical data shows which categories were synced

## Handling Category Changes

### When Category Names Change in Lightspeed:
1. Next sync fetches categories from Lightspeed
2. System matches by `category_id` (stable)
3. Updates `category_name` and `category_path` in database
4. User's preference (`is_enabled`) remains unchanged
5. UI shows updated name automatically

### When Categories Are Deleted:
- Preferences remain in database (historical record)
- Category won't appear in new sync operations
- Products already synced remain in system
- Could add cleanup job to archive old preferences

## Auto-Sync Features

### Auto-Sync New Products
**Setting:** "Auto-Sync New Products"
- **Enabled:** Products automatically sync when they go from 0 to 1+ stock
- **Disabled:** New items require manual approval before syncing

**How it works:**
- Monitors enabled categories only
- When a product in an enabled category gets stock
- Automatically imports it (if enabled)
- OR queues it for approval (if disabled)

### Scheduled Sync
**Setting:** "Enable Scheduled Sync"
- Syncs all products from enabled categories on schedule
- Options: Hourly, Daily, Weekly
- Uses same configuration (only enabled categories)

## Stock Requirements

**Important:** Only products with positive stock (quantity > 0) will sync from Lightspeed.

**Reasons:**
1. Reduces clutter (no out-of-stock items)
2. Improves performance (smaller dataset)
3. Focuses on sellable inventory
4. Aligns with "auto-sync when back in stock" feature

## Benefits of This Architecture

1. **Stable References:** Uses category IDs, handles name changes gracefully
2. **Clear Separation:** Configuration vs execution are distinct
3. **Flexible:** Users choose exactly what to sync
4. **Scalable:** Can handle many categories efficiently
5. **Auditable:** Tracks sync history per category
6. **User-Friendly:** Visual feedback on what's configured

## Future Enhancements

1. **Category Groups:** Allow saving category presets ("Summer Gear", "Winter Gear")
2. **Smart Sync:** Suggest popular categories based on product data
3. **Sync Reports:** Per-category sync statistics and history
4. **Conflict Resolution:** Handle products that change categories
5. **Partial Sync:** Sync only changed products within categories










