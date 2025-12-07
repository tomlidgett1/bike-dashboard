/**
 * Lightspeed API Test Endpoint
 * 
 * GET /api/lightspeed/test/[query]
 * 
 * Allows testing different Lightspeed API queries
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ query: string }> }
) {
  const startTime = Date.now()
  
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

    const { query } = await params

    console.log(`[Lightspeed Test] User ${user.id} testing query: ${query}`)

    // Create Lightspeed client
    const client = createLightspeedClient(user.id)

    let result: any = {}

    switch (query) {
      case 'itemshops-with-stock': {
        // Query ItemShops with positive stock - THIS IS THE CORRECT ENDPOINT
        console.log('[Lightspeed Test] Fetching ItemShops with stock...')
        
        // Use the >,0 operator (greater than 0) for qoh field
        const response = await client.getItemShops({
          qoh: '>,0',  // Operator format: '>,0' means qoh > 0
          limit: 100,
        })

        // ItemShops response wraps the array
        const itemShops = Array.isArray(response.ItemShop) ? response.ItemShop : [response.ItemShop]
        
        // Extract unique item IDs across all shops
        const allUniqueItemIds = [...new Set(itemShops.map(shop => shop.itemID))]
        
        // Get items from shopID:0 (total across all locations)
        const totalShopRecords = itemShops.filter(shop => shop.shopID === '0')
        const itemIdsFromShop0 = totalShopRecords.map(shop => shop.itemID)
        
        // Check if there are more pages
        const hasMorePages = response['@attributes']?.next && response['@attributes'].next !== ''

        result = {
          query: 'itemshops-with-stock',
          endpoint: '/ItemShop.json?qoh=%3E,0&limit=100',
          description: 'ALL item IDs with positive stock (from this page).',
          warning: hasMorePages ? 'More pages available! This shows first 100 records only.' : 'All records returned.',
          totalRecordsThisPage: itemShops.length,
          uniqueItemIdsThisPage: allUniqueItemIds.length,
          itemsWithShopId0: itemIdsFromShop0.length,
          hasMorePages: hasMorePages,
          nextPageUrl: response['@attributes']?.next || null,
          allUniqueItemIds: allUniqueItemIds, // EVERY unique item ID from this page
          itemIdsFromShop0: itemIdsFromShop0, // Item IDs from shopID:0 (totals)
          allRecords: itemShops.map(shop => ({
            itemID: shop.itemID,
            shopID: shop.shopID,
            qoh: shop.qoh,
            sellable: shop.sellable,
            reorderPoint: shop.reorderPoint,
          })),
          note: 'allUniqueItemIds shows EVERY unique item with stock on this page. itemIdsFromShop0 shows items from shopID:0 (totals across all locations).',
        }
        break
      }

      case 'items-in-stock': {
        // Query items - note: qoh filtering must be done on ItemShops endpoint, not Item endpoint
        console.log('[Lightspeed Test] Fetching items (first 100)...')
        
        // Get first 100 items (not archived)
        const items = await client.getItems({
          archived: 'false',
          limit: 100,
        })

        const itemIds = items.map(item => item.itemID)

        result = {
          query: 'items-in-stock',
          endpoint: '/Item.json?archived=false&limit=100',
          note: 'Note: QoH (quantity on hand) is stored in ItemShops, not Item. To filter by stock, you must query the ItemShops endpoint with qoh=>0, not the Item endpoint.',
          totalCount: items.length,
          itemsReturned: items.length,
          itemIds: itemIds.slice(0, 10), // First 10 IDs
          sampleItems: items.slice(0, 3).map(item => ({
            itemID: item.itemID,
            systemSku: item.systemSku,
            description: item.description,
            categoryID: item.categoryID,
            manufacturerID: item.manufacturerID,
            modelYear: item.modelYear,
            upc: item.upc,
          })),
          recommendation: 'To get items WITH stock, query ItemShops endpoint: GET /ItemShop.json?qoh=>0',
        }
        break
      }

      case 'all-categories': {
        // Query all categories
        console.log('[Lightspeed Test] Fetching categories...')
        
        const categories = await client.getCategories()

        result = {
          query: 'all-categories',
          endpoint: '/Category.json',
          totalCount: categories.length,
          categories: categories.slice(0, 10).map((cat) => ({
            categoryID: cat.categoryID,
            name: cat.name,
            fullPathName: cat.fullPathName,
            nodeDepth: cat.nodeDepth,
          })),
        }
        break
      }

      case 'account-info': {
        // Query account information
        console.log('[Lightspeed Test] Fetching account info...')
        
        const account = await client.getAccount()

        result = {
          query: 'account-info',
          endpoint: '/Account.json',
          account: {
            accountID: account.Account.accountID,
            name: account.Account.name,
            link: account.Account.link?.['@attributes']?.href || null,
          },
        }
        break
      }

      default:
        return NextResponse.json(
          { error: `Unknown query type: ${query}` },
          { status: 400 }
        )
    }

    const duration = Date.now() - startTime

    console.log(`[Lightspeed Test] Query completed in ${duration}ms`)

    return NextResponse.json({
      success: true,
      duration,
      timestamp: new Date().toISOString(),
      ...result,
    })

  } catch (error) {
    console.error('[Lightspeed Test] Error:', error)
    
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      {
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

