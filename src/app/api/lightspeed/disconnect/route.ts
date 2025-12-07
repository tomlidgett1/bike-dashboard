/**
 * Lightspeed Disconnect Endpoint
 * 
 * POST /api/lightspeed/disconnect
 * 
 * Disconnects the user's Lightspeed account by clearing tokens
 * and updating the connection status.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectUser, getConnection } from '@/lib/services/lightspeed'

export async function POST() {
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

    // Check if connection exists
    const connection = await getConnection(user.id)
    
    if (!connection) {
      return NextResponse.json(
        { error: 'No Lightspeed connection found' },
        { status: 404 }
      )
    }

    // Disconnect the user (clears tokens and updates status)
    await disconnectUser(user.id)

    // Delete sync settings
    await supabase
      .from('lightspeed_sync_settings')
      .delete()
      .eq('user_id', user.id)

    // Delete all products from products table (NOT canonical_products)
    console.log('[Disconnect] Deleting products for user:', user.id)
    const { error: deleteProductsError } = await supabase
      .from('products')
      .delete()
      .eq('user_id', user.id)

    if (deleteProductsError) {
      console.error('[Disconnect] Error deleting products:', deleteProductsError)
    }

    // Delete all products_all_ls entries
    console.log('[Disconnect] Deleting products_all_ls for user:', user.id)
    const { error: deleteAllLsError } = await supabase
      .from('products_all_ls')
      .delete()
      .eq('user_id', user.id)

    if (deleteAllLsError) {
      console.error('[Disconnect] Error deleting products_all_ls:', deleteAllLsError)
    }

    return NextResponse.json({
      success: true,
      message: 'Lightspeed account disconnected and products removed successfully',
    })
  } catch (error) {
    console.error('Error disconnecting Lightspeed:', error)
    
    return NextResponse.json(
      { error: 'Failed to disconnect Lightspeed account' },
      { status: 500 }
    )
  }
}








