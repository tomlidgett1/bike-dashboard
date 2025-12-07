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
    
    const requestBody = {
      categoryIds: uniqueCategoryIds,
      itemIds: itemIdsToSync, // Send specific items to sync
    }
    
    console.log('[Sync from Cache] Sending to edge function:', {
      categoryIds: uniqueCategoryIds,
      itemIdsCount: itemIdsToSync.length,
      itemIdsSample: itemIdsToSync.slice(0, 5),
    })
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
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

    // CRITICAL: Enable auto-updates by creating category preferences
    if (uniqueCategoryIds.length > 0 && result.data?.itemsSynced > 0) {
      console.log('[Sync from Cache] Creating category sync preferences for auto-updates')
      
      // Fetch category names
      const { createLightspeedClient } = await import('@/lib/services/lightspeed')
      const client = createLightspeedClient(user.id)
      
      try {
        const categories = await client.getCategories({ archived: 'false' })
        const categoryMap = new Map(categories.map(c => [c.categoryID, c]))
        
        // Create/update preferences for synced categories
        const preferences = uniqueCategoryIds.map(catId => {
          const category = categoryMap.get(catId)
          return {
            user_id: user.id,
            category_id: catId,
            category_name: category?.name || `Category ${catId}`,
            category_path: category?.fullPathName || category?.name || '',
            is_enabled: true, // Enable auto-updates for synced categories
            last_synced_at: new Date().toISOString(),
            product_count: productsToSync.filter(p => p.category_id === catId).length,
          }
        })

        const { error: prefError } = await supabase
          .from('lightspeed_category_sync_preferences')
          .upsert(preferences, {
            onConflict: 'user_id,category_id',
          })

        if (prefError) {
          console.error('[Sync from Cache] Error creating preferences:', prefError)
        } else {
          console.log(`[Sync from Cache] Enabled auto-updates for ${preferences.length} categories`)
        }
      } catch (catError) {
        console.error('[Sync from Cache] Error setting up preferences:', catError)
      }
    }

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

