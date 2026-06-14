/**
 * List Lightspeed products missing a manufacturer brand.
 *
 * GET /api/products/missing-brands?limit=20
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LIGHTSPEED_SOURCE_OR_FILTER, formatLightspeedCategory } from '@/lib/products/catalog-helpers'
import { readCachedBrandSuggestion } from '@/lib/missing-brands/suggestion-cache'
import type { MissingBrandProduct } from '@/lib/missing-brands/types'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

const SUGGESTION_SELECT = `
  id,
  description,
  display_name,
  custom_sku,
  system_sku,
  lightspeed_item_id,
  category_name,
  full_category_path,
  qoh,
  updated_at,
  suggested_brand_name,
  suggested_brand_manufacturer_id,
  suggested_brand_source,
  suggested_brand_confidence,
  suggested_brand_fingerprint
`

function formatSku(row: {
  custom_sku?: string | null
  system_sku?: string | null
  lightspeed_item_id?: string | null
}): string {
  const sku = (row.custom_sku || row.system_sku || '').trim()
  if (sku) return sku
  if (row.lightspeed_item_id) return `LS-${row.lightspeed_item_id}`
  return '—'
}

function buildPreview(row: {
  qoh?: number | null
  category_name?: string | null
  full_category_path?: string | null
}): string {
  const category = formatLightspeedCategory(row)
  if ((row.qoh ?? 0) > 0 && category) {
    return `In stock — no manufacturer set in Lightspeed (${category}).`
  }
  if ((row.qoh ?? 0) > 0) {
    return 'In stock — manufacturer field is empty in Lightspeed.'
  }
  if (category) {
    return `Catalogue item missing a brand (${category}).`
  }
  return 'Lightspeed item has no manufacturer set.'
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '', 10)
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT

    const [{ data: connection }, { data: rows, error: productsError }] = await Promise.all([
      supabase
        .from('lightspeed_connections')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .maybeSingle(),
      supabase
        .from('products')
        .select(SUGGESTION_SELECT)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('lightspeed_item_id', 'is', null)
        .or('manufacturer_name.is.null,manufacturer_name.eq.')
        .or(LIGHTSPEED_SOURCE_OR_FILTER)
        .order('qoh', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(limit),
    ])

    if (productsError) {
      console.error('[missing-brands] Failed to load products:', productsError)
      return NextResponse.json({ error: 'Failed to load products.' }, { status: 500 })
    }

    const products: MissingBrandProduct[] = (rows ?? []).map((row) => {
      let cached
      try {
        cached = readCachedBrandSuggestion(row)
      } catch (error) {
        console.warn('[missing-brands] Could not read suggestion cache for product:', row.id, error)
        cached = undefined
      }
      return {
        id: row.id,
        name: (row.display_name || row.description || 'Untitled product').trim(),
        sku: formatSku(row),
        category: formatLightspeedCategory(row),
        preview: buildPreview(row),
        lightspeedItemId: row.lightspeed_item_id ? String(row.lightspeed_item_id) : null,
        suggestion: cached === undefined ? undefined : cached,
      }
    })

    return NextResponse.json({
      products,
      lightspeedConnected: Boolean(connection),
    })
  } catch (error) {
    console.error('Error in GET /api/products/missing-brands:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
