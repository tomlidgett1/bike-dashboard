/**
 * List Lightspeed products missing a category.
 *
 * GET /api/products/missing-categories?limit=20
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedCategory } from '@/lib/services/lightspeed'
import { LIGHTSPEED_SOURCE_OR_FILTER } from '@/lib/products/catalog-helpers'
import { formatCategoryDisplayLabel } from '@/lib/products/category-recognition'
import { readCachedCategorySuggestion } from '@/lib/missing-categories/suggestion-cache'
import type { LightspeedCategoryOption, MissingCategoryProduct } from '@/lib/missing-categories/types'

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
  manufacturer_name,
  qoh,
  updated_at,
  lightspeed_category_id,
  suggested_category_id,
  suggested_category_label,
  suggested_category_source,
  suggested_category_confidence,
  suggested_category_fingerprint
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
  manufacturer_name?: string | null
}): string {
  const brand = row.manufacturer_name?.trim()
  if ((row.qoh ?? 0) > 0 && brand) {
    return `In stock — no Lightspeed category set (${brand}).`
  }
  if ((row.qoh ?? 0) > 0) {
    return 'In stock — category field is empty in Lightspeed.'
  }
  if (brand) {
    return `Catalogue item missing a category (${brand}).`
  }
  return 'Lightspeed item has no category assigned.'
}

function mapCategoryOptions(categories: LightspeedCategory[]): LightspeedCategoryOption[] {
  return categories
    .map((category) => ({
      categoryId: String(category.categoryID),
      label: formatCategoryDisplayLabel(category),
      fullPathName: category.fullPathName || category.name,
    }))
    .sort((a, b) => a.fullPathName.localeCompare(b.fullPathName))
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

    let lightspeedCategories: LightspeedCategory[] = []
    try {
      const client = createLightspeedClient(user.id)
      lightspeedCategories = await client.getAllCategories({ archived: 'false' })
    } catch (error) {
      console.warn('[missing-categories] Could not load Lightspeed categories:', error)
    }

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
        .or('lightspeed_category_id.is.null,lightspeed_category_id.eq.0')
        .or(LIGHTSPEED_SOURCE_OR_FILTER)
        .order('qoh', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(limit),
    ])

    if (productsError) {
      console.error('[missing-categories] Failed to load products:', productsError)
      return NextResponse.json({ error: 'Failed to load products.' }, { status: 500 })
    }

    const products: MissingCategoryProduct[] = (rows ?? []).map((row) => {
      let cached
      try {
        cached = readCachedCategorySuggestion(row)
      } catch (error) {
        console.warn('[missing-categories] Could not read suggestion cache for product:', row.id, error)
        cached = undefined
      }
      return {
        id: row.id,
        name: (row.display_name || row.description || 'Untitled product').trim(),
        sku: formatSku(row),
        brand: row.manufacturer_name?.trim() || null,
        preview: buildPreview(row),
        lightspeedItemId: row.lightspeed_item_id ? String(row.lightspeed_item_id) : null,
        suggestion: cached === undefined ? undefined : cached,
      }
    })

    return NextResponse.json({
      products,
      categories: mapCategoryOptions(lightspeedCategories),
      lightspeedConnected: Boolean(connection),
    })
  } catch (error) {
    console.error('Error in GET /api/products/missing-categories:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
