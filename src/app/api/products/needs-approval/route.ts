/**
 * GET /api/products/needs-approval
 *
 * Returns Lightspeed products that have at least one approved image
 * but no serper_workbench image — i.e. they are hidden on the marketplace
 * and need manual approval to go live.
 *
 * Groups results by lightspeed_category_id / category_name.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCloudinaryImageUrl, extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Fetch all Lightspeed products with stock that have product_images
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        manufacturer_name,
        price,
        qoh,
        lightspeed_category_id,
        category_name,
        listing_source,
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
      .eq('is_active', true)
      .gt('qoh', 0)

    if (error) {
      console.error('[needs-approval] Query error:', error)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    const results: Array<{
      id: string
      description: string
      display_name: string | null
      brand: string | null
      price: number
      qoh: number
      lightspeed_category_id: string | null
      category_name: string | null
      thumbnail_url: string | null
      best_image_id: string | null
    }> = []

    for (const p of products || []) {
      // Only process Lightspeed products
      const isLightspeed = !p.listing_source || p.listing_source === 'lightspeed'
      if (!isLightspeed) continue

      const productImgs: any[] = Array.isArray(p.product_images) ? p.product_images : []
      const canonicalImgs: any[] = (p as any).canonical_products?.product_images ?? []
      const allImages = [...productImgs, ...canonicalImgs]

      const approvedImages = allImages.filter(
        (img) => (img.approval_status === 'approved' || img.approval_status === null)
          && (img.cloudinary_public_id || img.cloudinary_url || img.external_url)
      )

      if (approvedImages.length === 0) continue // no image at all — skip (different problem)

      const hasSerper = approvedImages.some((img) => img.source === 'serper_workbench')
      if (hasSerper) continue // already approved — skip

      // Pick the best image to use as thumbnail
      const best = (
        approvedImages.find((img) => img.is_primary) ||
        approvedImages.sort((a: any, b: any) => (a.sort_order ?? 999) - (b.sort_order ?? 999))[0]
      )

      const publicId = best.cloudinary_public_id || extractCloudinaryPublicId(best.cloudinary_url)
      const thumbnail_url = buildCloudinaryImageUrl(publicId, 'thumbnail')
        || best.cloudinary_url
        || best.external_url
        || null

      results.push({
        id: p.id,
        description: p.description,
        display_name: p.display_name,
        brand: p.manufacturer_name || null,
        price: parseFloat(String(p.price)) || 0,
        qoh: p.qoh,
        lightspeed_category_id: p.lightspeed_category_id ? String(p.lightspeed_category_id) : null,
        category_name: p.category_name,
        thumbnail_url,
        best_image_id: best.id || null,
      })
    }

    // Sort by category then name
    results.sort((a, b) => {
      const cat = (a.category_name || '').localeCompare(b.category_name || '')
      if (cat !== 0) return cat
      return (a.display_name || a.description).localeCompare(b.display_name || b.description)
    })

    return NextResponse.json({ products: results, total: results.length })
  } catch (err) {
    console.error('[needs-approval] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
