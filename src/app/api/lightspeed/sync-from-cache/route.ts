/**
 * Sync from Cached Products API
 * 
 * POST /api/lightspeed/sync-from-cache
 * 
 * Syncs products from products_all_ls to products table without re-querying Lightspeed
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await request.json()
    const { categoryIds, itemIds } = body

    console.log('[Sync from Cache] Starting sync for user:', user.id, {
      categoryIds: categoryIds?.length || 0,
      itemIds: itemIds?.length || 0,
    })

    // Fetch products from products_all_ls
    let query = supabase
      .from('products_all_ls')
      .select('*')
      .eq('user_id', user.id)

    if (categoryIds && categoryIds.length > 0) {
      query = query.in('category_id', categoryIds)
    } else if (itemIds && itemIds.length > 0) {
      query = query.in('lightspeed_item_id', itemIds)
    }

    const { data: productsToSync, error: fetchError } = await query

    if (fetchError || !productsToSync || productsToSync.length === 0) {
      console.error('[Sync from Cache] No products found:', fetchError)
      return NextResponse.json({
        success: false,
        error: 'No products found to sync',
      }, { status: 400 })
    }

    console.log(`[Sync from Cache] Found ${productsToSync.length} products to sync`)

    // Get session for edge function
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'No session' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    // Extract item IDs and category IDs
    const itemIdsToSync = productsToSync.map(p => p.lightspeed_item_id)
    const uniqueCategoryIds = [...new Set(productsToSync.map(p => p.category_id).filter(Boolean))]

    console.log('[Sync from Cache] Syncing:', {
      itemIds: itemIdsToSync.length,
      categories: uniqueCategoryIds,
    })

    // Call edge function with BOTH categoryIds AND itemIds
    const functionUrl = `${supabaseUrl}/functions/v1/sync-lightspeed-inventory`
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        categoryIds: uniqueCategoryIds,
        itemIds: itemIdsToSync, // Send specific items to sync
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Sync from Cache] Edge function error:', errorData)
      return NextResponse.json({
        error: errorData.error || 'Sync failed',
      }, { status: response.status })
    }

    const result = await response.json()

    console.log('[Sync from Cache] Complete:', {
      itemsSynced: result.data?.itemsSynced || 0,
      itemsWithStock: result.data?.itemsWithStock || 0,
    })

    return NextResponse.json({
      success: true,
      data: result.data,
    })

  } catch (error) {
    console.error('[Sync from Cache] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

