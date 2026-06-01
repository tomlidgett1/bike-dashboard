/**
 * POST /api/products/approve-for-store
 *
 * Marks the best available image for each given product as
 * source = 'serper_workbench' so the product clears the marketplace
 * image gate and becomes visible on the store.
 *
 * Body: { product_ids: string[] }
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
    const productIds: string[] = body.product_ids ?? []

    if (!productIds.length) {
      return NextResponse.json({ error: 'product_ids is required' }, { status: 400 })
    }

    // Fetch each product's images (owned by this user)
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        listing_source,
        selected_product_image_id,
        canonical_product_id,
        product_images!product_id (
          id,
          cloudinary_public_id,
          cloudinary_url,
          external_url,
          approval_status,
          source,
          is_primary,
          sort_order
        ),
        canonical_products!canonical_product_id (
          product_images!canonical_product_id (
            id,
            cloudinary_public_id,
            cloudinary_url,
            external_url,
            approval_status,
            source,
            is_primary,
            sort_order
          )
        )
      `)
      .eq('user_id', user.id)
      .in('id', productIds)

    if (error) {
      console.error('[approve-for-store] Query error:', error)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    const imageIdsToUpdate: string[] = []
    const skipped: string[] = []

    for (const p of products || []) {
      const productImgs: any[] = Array.isArray(p.product_images) ? p.product_images : []
      const canonicalImgs: any[] = (p as any).canonical_products?.product_images ?? []

      // Priority: selected image > product-level primary > canonical primary > any approved
      const allImgs = [...productImgs, ...canonicalImgs]
      const approved = allImgs.filter(
        (img) => (img.approval_status === 'approved' || img.approval_status === null)
          && (img.cloudinary_public_id || img.cloudinary_url || img.external_url)
      )

      // Already has serper — skip
      if (approved.some((img) => img.source === 'serper_workbench')) {
        continue
      }

      let best: any = null

      // 1. selected image
      if (p.selected_product_image_id) {
        best = approved.find((img) => img.id === p.selected_product_image_id)
      }
      // 2. product-level primary
      if (!best) {
        best = productImgs.find((img) =>
          (img.approval_status === 'approved' || img.approval_status === null)
          && img.is_primary
          && (img.cloudinary_public_id || img.cloudinary_url || img.external_url)
        )
      }
      // 3. canonical primary
      if (!best) {
        best = canonicalImgs.find((img) =>
          (img.approval_status === 'approved' || img.approval_status === null)
          && img.is_primary
          && (img.cloudinary_public_id || img.cloudinary_url || img.external_url)
        )
      }
      // 4. any approved
      if (!best) {
        best = approved[0]
      }

      if (!best) {
        skipped.push(p.id)
        continue
      }

      imageIdsToUpdate.push(best.id)
    }

    if (imageIdsToUpdate.length === 0) {
      return NextResponse.json({
        approved: 0,
        skipped: skipped.length,
        message: 'Nothing to approve',
      })
    }

    // Update all selected images to source = 'serper_workbench'
    const { error: updateError } = await supabase
      .from('product_images')
      .update({ source: 'serper_workbench' })
      .in('id', imageIdsToUpdate)

    if (updateError) {
      console.error('[approve-for-store] Update error:', updateError)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({
      approved: imageIdsToUpdate.length,
      skipped: skipped.length,
    })
  } catch (err) {
    console.error('[approve-for-store] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
