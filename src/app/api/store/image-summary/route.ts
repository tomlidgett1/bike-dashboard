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
        canonical_products!canonical_product_id (
          product_images!canonical_product_id (
            cloudinary_public_id,
            cloudinary_url,
            external_url,
            approval_status
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gt('qoh', 0)
      .not('lightspeed_category_id', 'is', null)

    if (error) {
      console.error('[image-summary] Query error:', error)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    const summary = new Map<string, { total: number; missing: number }>()

    for (const row of rows || []) {
      const catId = String(row.lightspeed_category_id)
      const cur = summary.get(catId) ?? { total: 0, missing: 0 }
      cur.total++

      const images: Array<{
        cloudinary_public_id?: string | null
        cloudinary_url?: string | null
        external_url?: string | null
        approval_status?: string | null
      }> = (row as any).canonical_products?.product_images ?? []

      const hasImage = images.some(
        (img) =>
          (img.approval_status === 'approved' || img.approval_status === null) &&
          (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
      )

      if (!hasImage) cur.missing++
      summary.set(catId, cur)
    }

    const result = Array.from(summary.entries()).map(([ls_category_id, { total, missing }]) => ({
      ls_category_id,
      total,
      missing_images: missing,
    }))

    return NextResponse.json({ summary: result })
  } catch (err) {
    console.error('[image-summary] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
