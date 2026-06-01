/**
 * GET /api/store/image-summary
 *
 * Returns per-Lightspeed-category counts of active products that have no
 * approved image on their canonical product. Used by the Optimize page to
 * show "N missing photos" next to each category in the dropdown.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Fetch every active product (qoh > 0) that has a Lightspeed category,
    // along with just enough image metadata to determine if it has an image.
    const { data: rows, error } = await supabase
      .from('products')
      .select(`
        lightspeed_category_id,
        category_name,
        listing_source,
        canonical_products!canonical_product_id (
          product_images!canonical_product_id (
            cloudinary_public_id,
            cloudinary_url,
            external_url,
            approval_status,
            source
          )
        ),
        product_images!product_id (
          cloudinary_public_id,
          cloudinary_url,
          external_url,
          approval_status,
          source
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('qoh', 0)

    if (error) {
      console.error('[image-summary] Query error:', error)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    const summary = new Map<string, { total: number; missing: number; missing_serper: number }>()

    for (const row of rows || []) {
      // Use lightspeed_category_id when present; fall back to "name:<category_name>"
      // so the count aligns with the same key used by the categories/scan route.
      const catId = row.lightspeed_category_id
        ? String(row.lightspeed_category_id)
        : row.category_name
          ? `name:${row.category_name}`
          : null
      if (!catId) continue // no category at all — skip
      const cur = summary.get(catId) ?? { total: 0, missing: 0, missing_serper: 0 }
      cur.total++

      // Combine canonical and product-level images
      const canonicalImages: Array<{
        cloudinary_public_id?: string | null
        cloudinary_url?: string | null
        external_url?: string | null
        approval_status?: string | null
        source?: string | null
      }> = (row as any).canonical_products?.product_images ?? []

      const productImages: typeof canonicalImages = (row as any).product_images ?? []
      const allImages = [...canonicalImages, ...productImages]

      const hasAnyImage = allImages.some(
        (img) =>
          (img.approval_status === 'approved' || img.approval_status === null) &&
          (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
      )

      // A Lightspeed product is "marketplace ready" only if it has a serper_workbench image
      const isLightspeed = !row.listing_source || row.listing_source === 'lightspeed'
      const hasSerperImage = allImages.some(
        (img) =>
          img.source === 'serper_workbench' &&
          (img.approval_status === 'approved' || img.approval_status === null) &&
          (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
      )

      if (!hasAnyImage) cur.missing++
      // missing_serper = products that are Lightspeed but lack a serper_workbench image
      if (isLightspeed && !hasSerperImage) cur.missing_serper++

      summary.set(catId, cur)
    }

    const result = Array.from(summary.entries()).map(([ls_category_id, { total, missing, missing_serper }]) => ({
      ls_category_id,
      total,
      missing_images: missing,
      missing_serper_images: missing_serper,
    }))

    return NextResponse.json({ summary: result })
  } catch (err) {
    console.error('[image-summary] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
