/**
 * Lightspeed Inventory Sync Endpoint
 * 
 * POST /api/lightspeed/sync-inventory
 * 
 * Fetches all items from selected categories with positive stock and stores in products table
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { categoryIds } = body

    if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
      return NextResponse.json(
        { error: 'categoryIds array is required' },
        { status: 400 }
      )
    }

    console.log(`🔄 Starting inventory sync for user ${user.id}`)
    console.log(`📂 Categories: ${categoryIds.join(', ')}`)

    // Create Lightspeed client
    const client = createLightspeedClient(user.id)

    // Fetch account ID
    const accountId = await client.getAccountId()

    // Fetch all items from selected categories
    const allItems: any[] = []
    const seenItemIds = new Set<string>()

    for (const categoryId of categoryIds) {
      try {
        console.log(`📦 Fetching items for category ${categoryId}`)
        
        // Fetch all items in this category (up to 100 per category)
        const items = await client.getItems({
          categoryID: categoryId,
          archived: 'false',
          limit: 100,
        })

        console.log(`✅ Category ${categoryId}: Found ${items.length} items`)

        // Add items, avoiding duplicates
        for (const item of items) {
          if (!seenItemIds.has(item.itemID)) {
            seenItemIds.add(item.itemID)
            allItems.push(item)
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching items for category ${categoryId}:`, error)
      }
    }

    console.log(`📊 Total items collected: ${allItems.length}`)

    // Fetch inventory levels for all items
    console.log(`📈 Fetching inventory levels...`)
    const inventoryMap = new Map<string, { qoh: string; sellable: string; reorderPoint: string; reorderLevel: string }>()

    try {
      const itemShops = await client.getItemShops({
        shopID: '0', // shopID=0 is the aggregate across all shops
        limit: 100,
      })

      const itemShopsArray = Array.isArray(itemShops.ItemShop)
        ? itemShops.ItemShop
        : itemShops.ItemShop ? [itemShops.ItemShop] : []

      itemShopsArray.forEach((itemShop: any) => {
        inventoryMap.set(itemShop.itemID, {
          qoh: itemShop.qoh || '0',
          sellable: itemShop.sellable || '0',
          reorderPoint: itemShop.reorderPoint || '0',
          reorderLevel: itemShop.reorderLevel || '0',
        })
      })

      console.log(`✅ Loaded inventory for ${inventoryMap.size} items`)
    } catch (error) {
      console.error('❌ Error fetching inventory levels:', error)
    }

    // Fetch categories for enrichment
    console.log(`📂 Fetching categories...`)
    const categories = await client.getCategories({ archived: 'false' })
    const categoryMap = new Map(categories.map(cat => [cat.categoryID, {
      name: cat.name,
      fullPath: cat.fullPathName,
    }]))

    console.log(`✅ Loaded ${categories.length} categories`)

    // Filter items with positive stock and prepare for database
    const itemsWithStock = allItems.filter(item => {
      const inventory = inventoryMap.get(item.itemID)
      return inventory && parseInt(inventory.qoh) > 0
    })

    console.log(`✅ Found ${itemsWithStock.length} items with positive stock`)

    // Prepare products for database
    const productsToInsert = itemsWithStock.map(item => {
      const inventory = inventoryMap.get(item.itemID) || { qoh: '0', sellable: '0', reorderPoint: '0', reorderLevel: '0' }
      const category = categoryMap.get(item.categoryID)
      const prices = item.Prices?.ItemPrice ? (Array.isArray(item.Prices.ItemPrice)
        ? item.Prices.ItemPrice
        : [item.Prices.ItemPrice]) : []
      const defaultPrice = prices.find((p: any) => p.useType === 'Default')?.amount || '0'
      
      const images = item.Images?.Image ? (Array.isArray(item.Images.Image)
        ? item.Images.Image.map((img: any) => ({
            url: img.baseImageURL,
            publicId: img.publicID,
            filename: img.filename,
          }))
        : [{
            url: item.Images.Image.baseImageURL,
            publicId: item.Images.Image.publicID,
            filename: item.Images.Image.filename,
          }]) : []

      return {
        user_id: user.id,
        lightspeed_item_id: item.itemID,
        lightspeed_category_id: item.categoryID || null,
        lightspeed_account_id: accountId,
        system_sku: item.systemSku || null,
        custom_sku: item.customSku || null,
        description: item.description || 'Untitled Product',
        category_name: category?.name || null,
        full_category_path: category?.fullPath || null,
        price: parseFloat(defaultPrice),
        default_cost: parseFloat(item.defaultCost || '0'),
        avg_cost: parseFloat(item.avgCost || '0'),
        qoh: parseInt(inventory.qoh),
        sellable: parseInt(inventory.sellable),
        reorder_point: parseInt(inventory.reorderPoint),
        reorder_level: parseInt(inventory.reorderLevel),
        model_year: item.modelYear || null,
        upc: item.upc || null,
        manufacturer_id: item.manufacturerID || null,
        images: images,
        primary_image_url: images[0]?.url || null,
        lightspeed_updated_at: item.timeStamp,
        last_synced_at: new Date().toISOString(),
        is_active: true,
        is_archived: false,
      }
    })

    console.log(`💾 Inserting ${productsToInsert.length} products into database...`)

    // Batch upsert products
    const { error: upsertError } = await supabase
      .from('products')
      .upsert(productsToInsert, {
        onConflict: 'user_id,lightspeed_item_id',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      console.error('❌ Error upserting products:', upsertError)
      throw new Error(`Database error: ${upsertError.message}`)
    }

    console.log(`✅ Successfully synced ${productsToInsert.length} products`)

    // Update last sync time
    await supabase
      .from('lightspeed_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', user.id)

    // Create sync log
    await supabase
      .from('lightspeed_sync_logs')
      .insert({
        user_id: user.id,
        sync_type: 'manual',
        status: 'completed',
        entities_synced: ['products', 'inventory'],
        records_processed: allItems.length,
        records_created: productsToInsert.length,
        completed_at: new Date().toISOString(),
      })

    return NextResponse.json({
      success: true,
      message: 'Inventory synced successfully',
      data: {
        totalItems: allItems.length,
        itemsWithStock: itemsWithStock.length,
        itemsSynced: productsToInsert.length,
        categories: categoryIds.length,
      },
    })
  } catch (error) {
    console.error('❌ Sync error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Sync failed'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}












