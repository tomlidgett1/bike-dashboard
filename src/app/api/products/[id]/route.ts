/**
 * Individual Product API
 * 
 * PATCH /api/products/[id] - Update a single product (e.g., toggle is_active)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshPublicMarketplaceAfterMutation } from '@/lib/server/refresh-public-marketplace'
import { syncBikeSpecsFromProductSpecs } from '@/lib/bikes/sync-bike-specs-from-product-specs'
import type { BikeSpecSource } from '@/lib/types/bike-specs'

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
      .select('id, user_id, product_specs, bike_specs, product_spec_sources, brand, manufacturer_name, is_bicycle')
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

    // Build update payload — only include fields that were provided
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.is_active !== undefined) updatePayload.is_active = body.is_active
    if ('display_name' in body) updatePayload.display_name = body.display_name || null
    if ('product_description' in body) updatePayload.product_description = body.product_description || null
    if ('product_specs' in body) updatePayload.product_specs = body.product_specs || null
    if ('immersive_page' in body) updatePayload.immersive_page = !!body.immersive_page
    if ('is_bicycle' in body) updatePayload.is_bicycle = !!body.is_bicycle
    if ('bike_specs' in body) updatePayload.bike_specs = body.bike_specs || null

    if (body.is_bicycle === true && !('bike_specs' in body)) {
      const synced = syncBikeSpecsFromProductSpecs({
        productSpecs: existingProduct.product_specs,
        existingBikeSpecs: existingProduct.bike_specs,
        productSpecSources: (existingProduct.product_spec_sources ??
          []) as BikeSpecSource[],
        brand: existingProduct.brand || existingProduct.manufacturer_name,
      })
      if (synced) updatePayload.bike_specs = synced
    }

    // Update the product
    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', productId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating product:', updateError)
      throw updateError
    }

    if (body.is_active !== undefined) {
      await refreshPublicMarketplaceAfterMutation()
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
