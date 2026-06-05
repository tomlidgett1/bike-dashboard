/**
 * Product stats API
 *
 * GET /api/products/stats — aggregate counts for the products dashboard cards.
 * Uses batched reads so stores with >1000 products get accurate totals.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isLightspeedProduct } from '@/lib/products/catalog-helpers'

const BATCH_SIZE = 1000

type StatsRow = {
  is_active: boolean | null
  qoh: number | null
  reorder_point: number | null
  cached_image_url: string | null
  cached_thumbnail_url: string | null
  lightspeed_item_id: string | null
  listing_source: string | null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const { count: liveCount, error: liveError } = await supabase
      .from('marketplace_ready_products')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (liveError) {
      console.error('[Products Stats API] Live count error:', liveError)
      throw liveError
    }

    let from = 0
    const stats = {
      total: 0,
      live: liveCount ?? 0,
      lowStock: 0,
      needsImages: 0,
      lightspeed: 0,
      manual: 0,
    }

    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select(
          'is_active, qoh, reorder_point, cached_image_url, cached_thumbnail_url, lightspeed_item_id, listing_source'
        )
        .eq('user_id', user.id)
        .range(from, from + BATCH_SIZE - 1)

      if (error) {
        console.error('[Products Stats API] Query error:', error)
        throw error
      }

      const rows = (data ?? []) as StatsRow[]
      if (rows.length === 0) break

      for (const p of rows) {
        stats.total += 1

        const qoh = p.qoh ?? 0
        const reorder = p.reorder_point ?? 0
        if (qoh > 0 && qoh <= reorder) stats.lowStock += 1

        if (!p.cached_image_url && !p.cached_thumbnail_url) {
          stats.needsImages += 1
        }

        if (isLightspeedProduct(p)) stats.lightspeed += 1
        else stats.manual += 1
      }

      if (rows.length < BATCH_SIZE) break
      from += BATCH_SIZE
    }

    return NextResponse.json({ stats })
  } catch (error) {
    console.error('[Products Stats API] Error:', error)
    return NextResponse.json({ error: 'Failed to load product stats' }, { status: 500 })
  }
}
