/**
 * Lightspeed Sync Selected Items API
 * 
 * POST /api/lightspeed/sync-selected
 * 
 * Syncs selected categories or items from products_all_ls to products table
 * Uses data already fetched instead of querying Lightspeed again
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const { categoryIds, itemIds, syncType } = body

    if ((!categoryIds || categoryIds.length === 0) && (!itemIds || itemIds.length === 0)) {
      return NextResponse.json(
        { error: 'Either categoryIds or itemIds must be provided' },
        { status: 400 }
      )
    }

    console.log(`[Sync Selected] User ${user.id}, type: ${syncType}`)

    // Build query to fetch products from products_all_ls
    let query = supabase
      .from('products_all_ls')
      .select('*')
      .eq('user_id', user.id)

    if (categoryIds && categoryIds.length > 0) {
      query = query.in('category_id', categoryIds)
      console.log('[Sync Selected] Fetching products from categories:', categoryIds)
    } else if (itemIds && itemIds.length > 0) {
      query = query.in('lightspeed_item_id', itemIds)
      console.log('[Sync Selected] Fetching specific items:', itemIds.length)
    }

    const { data: productsToSync, error: fetchError } = await query

    if (fetchError) {
      console.error('[Sync Selected] Error fetching products:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      )
    }

    if (!productsToSync || productsToSync.length === 0) {
      console.log('[Sync Selected] No products found to sync')
      return NextResponse.json({
        success: true,
        data: {
          itemsSynced: 0,
          itemsWithStock: 0,
          message: 'No products found in selected categories',
        },
      })
    }

    console.log(`[Sync Selected] Found ${productsToSync.length} products to sync from products_all_ls`)

    // Get session for edge function call
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    // Extract unique category IDs from the products
    const uniqueCategoryIds = [...new Set(productsToSync.map(p => p.category_id).filter(Boolean))]
    
    console.log('[Sync Selected] Unique categories to sync:', uniqueCategoryIds)

    // Call the edge function with category IDs
    const functionUrl = `${supabaseUrl}/functions/v1/sync-lightspeed-inventory`
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        categoryIds: uniqueCategoryIds,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Sync Selected] Edge function error:', errorData)
      return NextResponse.json(
        { error: errorData.error || 'Sync failed' },
        { status: response.status }
      )
    }

    const result = await response.json()

    console.log('[Sync Selected] Edge function result:', {
      itemsSynced: result.data?.itemsSynced || 0,
      itemsWithStock: result.data?.itemsWithStock || 0,
      totalItems: result.data?.totalItemsInCategories || 0,
    })

    return NextResponse.json({
      success: true,
      data: result.data,
    })

  } catch (error) {
    console.error('[Sync Selected] Error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}

