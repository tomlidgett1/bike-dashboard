/**
 * Individual Product API
 * 
 * PATCH /api/products/[id] - Update a single product (e.g., toggle is_active)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: productId } = await params
    const body = await request.json()

    // Validate that the product belongs to the user
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('id, user_id')
      .eq('id', productId)
      .single()

    if (fetchError || !existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    if (existingProduct.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorised to update this product' },
        { status: 403 }
      )
    }

    // Update the product
    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update({
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating product:', updateError)
      throw updateError
    }

    return NextResponse.json({
      success: true,
      product: updatedProduct,
    })
  } catch (error) {
    console.error('Error updating product:', error)
    
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

