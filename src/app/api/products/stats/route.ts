/**
 * Product stats API
 *
 * GET /api/products/stats — aggregate counts for the products dashboard cards:
 * total, live (active), low stock, and needs-images.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    // Minimal columns for all of the user's products — enough to compute every
    // card accurately (incl. the qoh vs reorder_point comparison) in one round trip.
    const { data, error } = await supabase
      .from('products')
      .select('is_active, qoh, reorder_point, cached_image_url, cached_thumbnail_url')
      .eq('user_id', user.id)

    if (error) {
      console.error('[Products Stats API] Query error:', error)
      throw error
    }

    const rows = data ?? []
    const stats = {
      total: rows.length,
      live: rows.filter((p) => p.is_active).length,
      lowStock: rows.filter(
        (p) => (p.qoh ?? 0) > 0 && (p.qoh ?? 0) <= (p.reorder_point ?? 0)
      ).length,
      needsImages: rows.filter(
        (p) => !p.cached_image_url && !p.cached_thumbnail_url
      ).length,
    }

    return NextResponse.json({ stats })
  } catch (error) {
    console.error('[Products Stats API] Error:', error)
    return NextResponse.json({ error: 'Failed to load product stats' }, { status: 500 })
  }
}
