/**
 * Bulk Delete Products API
 * 
 * DELETE /api/products/bulk-delete
 * 
 * Deletes products by IDs or by category IDs (soft delete - marks as inactive)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(request: NextRequest) {
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
    const { productIds, categoryIds, hardDelete = false } = body

    if ((!productIds || productIds.length === 0) && (!categoryIds || categoryIds.length === 0)) {
      return NextResponse.json(
        { error: 'Either productIds or categoryIds must be provided' },
        { status: 400 }
      )
    }

    console.log(`[Bulk Delete] User ${user.id}`, {
      productIds: productIds?.length || 0,
      categoryIds: categoryIds?.length || 0,
      hardDelete,
    })

    let deletedCount = 0

    // Delete by product IDs
    if (productIds && productIds.length > 0) {
      if (hardDelete) {
        const { error: deleteError, count } = await supabase
          .from('products')
          .delete({ count: 'exact' })
          .eq('user_id', user.id)
          .in('id', productIds)

        if (deleteError) {
          console.error('[Bulk Delete] Error deleting products:', deleteError)
          return NextResponse.json(
            { error: 'Failed to delete products' },
            { status: 500 }
          )
        }

        deletedCount = count || 0
      } else {
        // Soft delete - mark as inactive
        const { error: updateError, count } = await supabase
          .from('products')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .in('id', productIds)

        if (updateError) {
          console.error('[Bulk Delete] Error marking products inactive:', updateError)
          return NextResponse.json(
            { error: 'Failed to update products' },
            { status: 500 }
          )
        }

        deletedCount = count || 0
      }
    }

    // Delete by category IDs
    if (categoryIds && categoryIds.length > 0) {
      if (hardDelete) {
        const { error: deleteError, count } = await supabase
          .from('products')
          .delete({ count: 'exact' })
          .eq('user_id', user.id)
          .in('lightspeed_category_id', categoryIds)

        if (deleteError) {
          console.error('[Bulk Delete] Error deleting by category:', deleteError)
          return NextResponse.json(
            { error: 'Failed to delete products' },
            { status: 500 }
          )
        }

        deletedCount += count || 0
      } else {
        // Soft delete - mark as inactive
        const { error: updateError, count } = await supabase
          .from('products')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .in('lightspeed_category_id', categoryIds)

        if (updateError) {
          console.error('[Bulk Delete] Error marking category products inactive:', updateError)
          return NextResponse.json(
            { error: 'Failed to update products' },
            { status: 500 }
          )
        }

        deletedCount += count || 0
      }
    }

    console.log(`[Bulk Delete] ${hardDelete ? 'Deleted' : 'Deactivated'} ${deletedCount} products`)

    return NextResponse.json({
      success: true,
      deletedCount,
      action: hardDelete ? 'deleted' : 'deactivated',
    })

  } catch (error) {
    console.error('[Bulk Delete] Error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}

