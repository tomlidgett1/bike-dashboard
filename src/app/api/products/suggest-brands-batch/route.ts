/**
 * Batch brand suggestions for missing-brand products (no Lightspeed write).
 * Uses cached suggestions when still valid; persists new results.
 *
 * POST /api/products/suggest-brands-batch
 * Body: { productIds: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedManufacturer } from '@/lib/services/lightspeed'
import { computeBrandSuggestion } from '@/lib/missing-brands/compute-suggestion'
import {
  brandSuggestionCacheUpdate,
  readCachedBrandSuggestion,
  type BrandSuggestionProductRow,
} from '@/lib/missing-brands/suggestion-cache'
import type { SuggestBrandResponse } from '@/lib/missing-brands/types'

export const dynamic = 'force-dynamic'

const MAX_BATCH = 20
const AI_CONCURRENCY = 4

const PRODUCT_SELECT = `
  id,
  description,
  display_name,
  manufacturer_name,
  category_name,
  full_category_path,
  suggested_brand_name,
  suggested_brand_manufacturer_id,
  suggested_brand_source,
  suggested_brand_confidence,
  suggested_brand_fingerprint
`

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const current = index++
      results[current] = await fn(items[current])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const body = await request.json()
    const rawIds = Array.isArray(body?.productIds) ? body.productIds : []
    const productIds = rawIds
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      .slice(0, MAX_BATCH)

    if (productIds.length === 0) {
      return NextResponse.json({ error: 'productIds is required.' }, { status: 400 })
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('user_id', user.id)
      .in('id', productIds)

    if (productsError) {
      console.error('[suggest-brands-batch] Failed to load products:', productsError)
      return NextResponse.json({ error: 'Failed to load products.' }, { status: 500 })
    }

    const rows = (products ?? []) as BrandSuggestionProductRow[]
    const rowById = new Map(rows.map((row) => [row.id, row]))

    let manufacturers: LightspeedManufacturer[] = []
    try {
      const client = createLightspeedClient(user.id)
      manufacturers = await client.getAllManufacturers()
    } catch (error) {
      console.warn('[suggest-brands-batch] Could not load Lightspeed manufacturers:', error)
    }

    const knownBrandNames = manufacturers
      .map((m) => (m.name || '').trim())
      .filter(Boolean)
      .slice(0, 400)

    const cachedResults: Array<SuggestBrandResponse & { productId: string }> = []
    const needsCompute: BrandSuggestionProductRow[] = []

    for (const id of productIds) {
      const product = rowById.get(id)
      if (!product) {
        cachedResults.push({
          productId: id,
          brand: null,
          manufacturerId: null,
          confidence: 'none',
          source: 'none',
        })
        continue
      }

      const cached = readCachedBrandSuggestion(product)
      if (cached !== undefined) {
        cachedResults.push({
          productId: id,
          brand: cached?.brand ?? null,
          manufacturerId: cached?.manufacturerId ?? null,
          confidence: cached?.confidence ?? 'none',
          source: cached?.source ?? 'none',
        })
        continue
      }

      needsCompute.push(product)
    }

    const computed = await mapWithConcurrency(needsCompute, AI_CONCURRENCY, async (product) => {
      try {
        return await computeBrandSuggestion(product, manufacturers, knownBrandNames)
      } catch (error) {
        console.error('[suggest-brands-batch] Suggestion failed for product:', product.id, error)
        return {
          productId: product.id,
          brand: null,
          manufacturerId: null,
          confidence: 'none' as const,
          source: 'none' as const,
        }
      }
    })

    for (const suggestion of computed) {
      const product = rowById.get(suggestion.productId)
      if (!product) continue

      const { error: cacheError } = await supabase
        .from('products')
        .update(brandSuggestionCacheUpdate(product, suggestion))
        .eq('id', product.id)
        .eq('user_id', user.id)

      if (cacheError) {
        console.warn('[suggest-brands-batch] Failed to cache suggestion:', cacheError)
      }
    }

    const suggestions = [...cachedResults, ...computed]

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Error in POST /api/products/suggest-brands-batch:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
