/**
 * Lightspeed Items Endpoint
 * 
 * GET /api/lightspeed/items?categoryIds=1,2,3&limit=30
 * 
 * Fetches items from Lightspeed filtered by category IDs
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'

export async function GET(request: NextRequest) {
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const categoryIdsParam = searchParams.get('categoryIds')
    const limit = parseInt(searchParams.get('limit') || '30')

    if (!categoryIdsParam) {
      return NextResponse.json(
        { error: 'categoryIds parameter is required' },
        { status: 400 }
      )
    }

    const categoryIds = categoryIdsParam.split(',').filter(Boolean)

    // Create Lightspeed client
    const client = createLightspeedClient(user.id)
    
    // Fetch items for each category (divide limit across categories)
    const allItems: any[] = []
    const seenItemIds = new Set<string>()
    const itemsPerCategory = Math.ceil(limit / categoryIds.length)

    for (const categoryId of categoryIds) {
      try {
        const items = await client.getItems({
          categoryID: categoryId,
          archived: 'false',
          limit: itemsPerCategory,
        })
        
        console.log(`Category ${categoryId}: Found ${items.length} items`)

        // Add items, avoiding duplicates
        for (const item of items) {
          if (!seenItemIds.has(item.itemID)) {
            seenItemIds.add(item.itemID)
            allItems.push({
              id: item.itemID,
              systemSku: item.systemSku || '',
              customSku: item.customSku || '',
              description: item.description || '',
              categoryId: item.categoryID || '',
              manufacturerId: item.manufacturerID || '',
              modelYear: item.modelYear || '',
              upc: item.upc || '',
              prices: item.Prices?.ItemPrice ? (Array.isArray(item.Prices.ItemPrice) 
                ? item.Prices.ItemPrice 
                : [item.Prices.ItemPrice]) : [],
              defaultCost: item.defaultCost || '0',
              avgCost: item.avgCost || '0',
              images: item.Images?.Image ? (Array.isArray(item.Images.Image)
                ? item.Images.Image.map((img: any) => ({
                    url: img.baseImageURL,
                    publicId: img.publicID,
                  }))
                : [{
                    url: (item.Images.Image as any).baseImageURL,
                    publicId: (item.Images.Image as any).publicID,
                  }]) : [],
              timeStamp: item.timeStamp,
            })
          }
        }
      } catch (error) {
        console.error(`Error fetching items for category ${categoryId}:`, error)
      }
    }
    
    console.log(`Total items collected: ${allItems.length} from ${categoryIds.length} categories`)

    // Fetch categories for item details
    const categories = await client.getCategories({ archived: 'false' })
    const categoryMap = new Map(categories.map(cat => [cat.categoryID, cat.name]))

    // Fetch inventory levels (ItemShops) for all items
    const itemIds = allItems.map(item => item.id)
    const inventoryMap = new Map<string, { qoh: string; sellable: string }>()
    
    if (itemIds.length > 0) {
      try {
        // Fetch ItemShops with shopID=0 (total across all shops)
        const itemShops = await client.getItemShops({
          shopID: '0',
          limit: 100,
        })
        
        const itemShopsArray = Array.isArray(itemShops.ItemShop) 
          ? itemShops.ItemShop 
          : itemShops.ItemShop ? [itemShops.ItemShop] : []
        
        itemShopsArray.forEach((itemShop: any) => {
          inventoryMap.set(itemShop.itemID, {
            qoh: itemShop.qoh || '0',
            sellable: itemShop.sellable || '0',
          })
        })
      } catch (error) {
        console.error('Error fetching inventory levels:', error)
      }
    }

    // Enrich items with category names and inventory
    const enrichedItems = allItems.map(item => {
      const inventory = inventoryMap.get(item.id) || { qoh: '0', sellable: '0' }
      return {
        ...item,
        category: categoryMap.get(item.categoryId) || 'Unknown',
        price: item.prices.find((p: any) => p.useType === 'Default')?.amount || '0',
        qoh: inventory.qoh,
        sellable: inventory.sellable,
      }
    })

    return NextResponse.json({
      items: enrichedItems,
      total: enrichedItems.length,
    })
  } catch (error) {
    console.error('Error fetching items:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch items'
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

