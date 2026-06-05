/**
 * Delete All Products Endpoint
 * 
 * DELETE /api/products/delete-all
 * 
 * Deletes all products for the authenticated user
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshPublicMarketplaceAfterMutation } from '@/lib/server/refresh-public-marketplace'

export async function DELETE() {
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

    console.log(`🗑️ Deleting all products for user ${user.id}`)

    // Delete all products for this user
    const { error: deleteError, count } = await supabase
      .from('products')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting products:', deleteError)
      throw deleteError
    }

    console.log(`✅ Deleted ${count || 0} products`)

    if ((count || 0) > 0) {
      await refreshPublicMarketplaceAfterMutation()
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${count || 0} products`,
      deletedCount: count || 0,
    })
  } catch (error) {
    console.error('Error deleting products:', error)
    
    return NextResponse.json(
      { error: 'Failed to delete products' },
      { status: 500 }
    )
  }
}















