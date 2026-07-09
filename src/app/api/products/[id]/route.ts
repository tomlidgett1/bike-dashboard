/**
 * Individual Product API
 *
 * GET   /api/products/[id] - Fetch a single product with images
 * PATCH /api/products/[id] - Update a single product (e.g., toggle is_active)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshPublicMarketplaceAfterMutation } from '@/lib/server/refresh-public-marketplace'
import { syncBikeSpecsFromProductSpecs } from '@/lib/bikes/sync-bike-specs-from-product-specs'
import { buildCloudinaryImageUrl, extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms'
import { getMarketplaceReadiness } from '@/lib/marketplace/product-readiness'
import type { BikeSpecSource } from '@/lib/types/bike-specs'

function processProductRow(product: Record<string, unknown>) {
  let resolvedImageUrl: string | null = null

  const canonicalProducts = product.canonical_products as {
    marketplace_category?: string | null
    marketplace_subcategory?: string | null
    marketplace_level_3_category?: string | null
    product_images?: Array<{
      cloudinary_public_id?: string | null
      cloudinary_url?: string | null
      external_url?: string | null
      approval_status?: string | null
      is_primary?: boolean | null
    }>
  } | null

  if (canonicalProducts?.product_images && Array.isArray(canonicalProducts.product_images)) {
    const approvedImages = canonicalProducts.product_images.filter(
      (img) => img.approval_status === 'approved' || img.approval_status === null
    )
    const primaryImage = approvedImages.find((img) => img.is_primary) || approvedImages[0]
    if (primaryImage) {
      const publicId =
        primaryImage.cloudinary_public_id ||
        extractCloudinaryPublicId(primaryImage.cloudinary_url ?? null)
      resolvedImageUrl =
        buildCloudinaryImageUrl(publicId, 'grid_card') ||
        primaryImage.cloudinary_url ||
        primaryImage.external_url ||
        null
    }
  }

  if (!resolvedImageUrl) {
    resolvedImageUrl =
      (product.cached_image_url as string | null) ||
      (product.cached_thumbnail_url as string | null) ||
      (product.primary_image_url as string | null) ||
      null
  }

  const productImages = Array.isArray(product.product_images) ? product.product_images : []
  const canonicalImages = Array.isArray(canonicalProducts?.product_images)
    ? canonicalProducts.product_images
    : []

  const marketplace_readiness = getMarketplaceReadiness({
    is_active: (product.is_active as boolean) ?? false,
    listing_status: (product.listing_status as string | null) ?? null,
    listing_type: (product.listing_type as string | null) ?? null,
    qoh: (product.qoh as number | null) ?? null,
    selected_product_image_id: (product.selected_product_image_id as string | null) ?? null,
    productImages,
    canonicalImages,
  })

  return {
    ...product,
    resolved_image_url: resolvedImageUrl,
    marketplace_readiness,
    brand: (product.manufacturer_name as string | null) || null,
    marketplace_category:
      (product.marketplace_category as string | null) ??
      canonicalProducts?.marketplace_category ??
      null,
    marketplace_subcategory:
      (product.marketplace_subcategory as string | null) ??
      canonicalProducts?.marketplace_subcategory ??
      null,
    marketplace_level_3_category:
      (product.marketplace_level_3_category as string | null) ??
      canonicalProducts?.marketplace_level_3_category ??
      null,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const { id: productId } = await params

    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select(`
        *,
        product_images!product_id (
          id,
          cloudinary_public_id,
          cloudinary_url,
          external_url,
          is_primary,
          approval_status,
          sort_order,
          source
        ),
        canonical_products!canonical_product_id (
          id,
          upc,
          normalized_name,
          marketplace_category,
          marketplace_subcategory,
          marketplace_level_3_category,
          product_images!canonical_product_id (
            id,
            cloudinary_public_id,
            cloudinary_url,
            external_url,
            is_primary,
            approval_status,
            sort_order,
            source
          )
        )
      `)
      .eq('id', productId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      product: processProductRow(product as Record<string, unknown>),
    })
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

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
      .select('id, user_id, product_specs, bike_specs, product_spec_sources, manufacturer_name, is_bicycle')
      .eq('id', productId)
      .single()

    if (fetchError || !existingProduct) {
      if (fetchError) console.error('Error fetching product for update:', fetchError)
      return NextResponse.json(
        { error: fetchError?.message || 'Product not found' },
        { status: fetchError ? 500 : 404 }
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
    if ('is_bicycle' in body) updatePayload.is_bicycle = !!body.is_bicycle
    if ('bike_specs' in body) updatePayload.bike_specs = body.bike_specs || null

    if (body.is_bicycle === true && !('bike_specs' in body)) {
      const synced = syncBikeSpecsFromProductSpecs({
        productSpecs: existingProduct.product_specs,
        existingBikeSpecs: existingProduct.bike_specs,
        productSpecSources: (existingProduct.product_spec_sources ??
          []) as BikeSpecSource[],
        brand: existingProduct.manufacturer_name,
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
      return NextResponse.json(
        { error: updateError.message || 'Failed to update product' },
        { status: 500 }
      )
    }

    if (body.is_active !== undefined) {
      try {
        await refreshPublicMarketplaceAfterMutation()
      } catch (refreshError) {
        console.warn('Product updated, but marketplace refresh failed:', refreshError)
      }
    }

    return NextResponse.json({
      success: true,
      product: updatedProduct,
    })
  } catch (error) {
    console.error('Error updating product:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update product' },
      { status: 500 }
    )
  }
}
