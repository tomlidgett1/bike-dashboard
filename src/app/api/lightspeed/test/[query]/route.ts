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
      case 'items-in-stock': {
        // Query items with positive stock
        console.log('[Lightspeed Test] Fetching items with stock...')
        
        const items = await client.getItems({
          qoh: '>,0',
          limit: 100,
          offset: 0,
        })

        const itemIds = items.Item.map(item => item.itemID)
        const totalCount = items['@attributes']?.count || items.Item.length

        result = {
          query: 'items-in-stock',
          endpoint: '/Item.json?qoh=>,0&limit=100&offset=0',
          totalCount: parseInt(totalCount),
          itemsReturned: items.Item.length,
          itemIds: itemIds.slice(0, 10), // First 10 IDs
          sampleItems: items.Item.slice(0, 3).map(item => ({
            itemID: item.itemID,
            systemSku: item.systemSku,
            description: item.description,
            qoh: item.Prices?.ItemPrice?.[0]?.qoh || 0,
            price: item.Prices?.ItemPrice?.[0]?.amount || 0,
          })),
          pagination: {
            limit: 100,
            offset: 0,
            hasMore: parseInt(totalCount) > 100,
            totalPages: Math.ceil(parseInt(totalCount) / 100),
          },
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
          totalCount: categories.Category?.length || 0,
          categories: categories.Category?.slice(0, 10).map((cat: any) => ({
            categoryID: cat.categoryID,
            name: cat.name,
            fullPathName: cat.fullPathName,
            nodeDepth: cat.nodeDepth,
          })) || [],
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
            link: account.Account.link,
            timeZone: account.Account.timeZone,
            currency: account.Account.currency,
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

