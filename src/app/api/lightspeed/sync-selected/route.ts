/**
 * Lightspeed Sync Selected Items API
 * 
 * POST /api/lightspeed/sync-selected
 * 
 * Syncs selected categories or individual items to products and canonical_products tables
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

    console.log(`[Sync Selected] User ${user.id}, type: ${syncType}`, {
      categoryIds: categoryIds?.length || 0,
      itemIds: itemIds?.length || 0,
    })

    // Get session for edge function call
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      )
    }

    // Prepare data for edge function
    // Note: Edge function only supports categoryIds, not individual itemIds
    let functionBody: any = {}

    if (categoryIds && categoryIds.length > 0) {
      functionBody.categoryIds = categoryIds
      console.log('[Sync Selected] Syncing categories:', categoryIds)
    } else if (itemIds && itemIds.length > 0) {
      // For individual items, we need to fetch them and sync by category
      // For now, get all unique categories from the selected items
      const { data: itemsData } = await supabase
        .from('products_all_ls')
        .select('category_id')
        .in('lightspeed_item_id', itemIds)
        .eq('user_id', user.id)
      
      const uniqueCategoryIds = [...new Set(itemsData?.map(item => item.category_id).filter(Boolean))]
      
      if (uniqueCategoryIds.length === 0) {
        return NextResponse.json(
          { error: 'No categories found for selected items' },
          { status: 400 }
        )
      }
      
      functionBody.categoryIds = uniqueCategoryIds
      console.log('[Sync Selected] Syncing items via categories:', uniqueCategoryIds)
    }

    // Call the existing sync-lightspeed-inventory edge function
    const functionUrl = `${supabaseUrl}/functions/v1/sync-lightspeed-inventory`
    
    console.log('[Sync Selected] Calling edge function:', functionUrl)

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(functionBody),
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

    console.log('[Sync Selected] Sync complete:', {
      itemsSynced: result.data?.itemsSynced || 0,
      itemsWithStock: result.data?.itemsWithStock || 0,
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

