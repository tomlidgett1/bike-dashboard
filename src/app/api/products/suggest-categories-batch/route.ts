/**
 * Batch category suggestions for uncategorised products (no Lightspeed write).
 * Uses cached suggestions when still valid; persists new results.
 *
 * POST /api/products/suggest-categories-batch
 * Body: { productIds: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedCategory } from '@/lib/services/lightspeed'
import { computeCategorySuggestion } from '@/lib/missing-categories/compute-suggestion'
import {
  categorySuggestionCacheUpdate,
  readCachedCategorySuggestion,
  type CategorySuggestionProductRow,
} from '@/lib/missing-categories/suggestion-cache'
import type { SuggestCategoryResponse } from '@/lib/missing-categories/types'

export const dynamic = 'force-dynamic'

const MAX_BATCH = 20
const AI_CONCURRENCY = 4

const PRODUCT_SELECT = `
  id,
  description,
  display_name,
  manufacturer_name,
  lightspeed_category_id,
  category_name,
  full_category_path,
  suggested_category_id,
  suggested_category_label,
  suggested_category_source,
  suggested_category_confidence,
  suggested_category_fingerprint
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
      console.error('[suggest-categories-batch] Failed to load products:', productsError)
      return NextResponse.json({ error: 'Failed to load products.' }, { status: 500 })
    }

    const rows = (products ?? []) as CategorySuggestionProductRow[]
    const rowById = new Map(rows.map((row) => [row.id, row]))

    let categories: LightspeedCategory[] = []
    try {
      const client = createLightspeedClient(user.id)
      categories = await client.getAllCategories({ archived: 'false' })
    } catch (error) {
      console.warn('[suggest-categories-batch] Could not load Lightspeed categories:', error)
    }

    const cachedResults: Array<SuggestCategoryResponse & { productId: string }> = []
    const needsCompute: CategorySuggestionProductRow[] = []

    for (const id of productIds) {
      const product = rowById.get(id)
      if (!product) {
        cachedResults.push({
          productId: id,
          categoryId: null,
          categoryLabel: null,
          confidence: 'none',
          source: 'none',
        })
        continue
      }

      const cached = readCachedCategorySuggestion(product)
      if (cached !== undefined) {
        cachedResults.push({
          productId: id,
          categoryId: cached?.categoryId ?? null,
          categoryLabel: cached?.categoryLabel ?? null,
          confidence: cached?.confidence ?? 'none',
          source: cached?.source ?? 'none',
        })
        continue
      }

      needsCompute.push(product)
    }

    const computed = await mapWithConcurrency(needsCompute, AI_CONCURRENCY, async (product) => {
      try {
        return await computeCategorySuggestion(product, categories)
      } catch (error) {
        console.error('[suggest-categories-batch] Suggestion failed for product:', product.id, error)
        return {
          productId: product.id,
          categoryId: null,
          categoryLabel: null,
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
        .update(categorySuggestionCacheUpdate(product, suggestion))
        .eq('id', product.id)
        .eq('user_id', user.id)

      if (cacheError) {
        console.warn('[suggest-categories-batch] Failed to cache suggestion:', cacheError)
      }
    }

    const suggestions = [...cachedResults, ...computed]

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Error in POST /api/products/suggest-categories-batch:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
