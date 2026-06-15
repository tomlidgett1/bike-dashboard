/**
 * Suggest a category for a product (no Lightspeed write).
 * Returns cached suggestion when still valid; persists new results.
 *
 * POST /api/products/suggest-category
 * Body: { productId: string }
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

export const dynamic = 'force-dynamic'

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
    const productId = typeof body?.productId === 'string' ? body.productId : ''

    if (!productId) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('id', productId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (productError) {
      console.error('[suggest-category] Failed to load product:', productError)
      return NextResponse.json({ error: 'Failed to load product.' }, { status: 500 })
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    const row = product as CategorySuggestionProductRow & {
      lightspeed_category_id?: string | null
      category_name?: string | null
      full_category_path?: string | null
    }

    const existingId = row.lightspeed_category_id?.trim()
    if (existingId && existingId !== '0') {
      return NextResponse.json({
        categoryId: existingId,
        categoryLabel: row.full_category_path || row.category_name || existingId,
        confidence: 'high',
        source: 'none',
      })
    }

    const cached = readCachedCategorySuggestion(row)
    if (cached !== undefined) {
      return NextResponse.json({
        categoryId: cached?.categoryId ?? null,
        categoryLabel: cached?.categoryLabel ?? null,
        confidence: cached?.confidence ?? 'none',
        source: cached?.source ?? 'none',
      })
    }

    const productName = (row.display_name || row.description || '').trim()
    if (!productName) {
      return NextResponse.json({ error: 'Product has no name to categorise.' }, { status: 400 })
    }

    let categories: LightspeedCategory[] = []
    try {
      const client = createLightspeedClient(user.id)
      categories = await client.getAllCategories({ archived: 'false' })
    } catch (error) {
      console.warn('[suggest-category] Could not load Lightspeed categories:', error)
    }

    const suggestion = await computeCategorySuggestion(row, categories)

    const { error: cacheError } = await supabase
      .from('products')
      .update(categorySuggestionCacheUpdate(row, suggestion))
      .eq('id', row.id)
      .eq('user_id', user.id)

    if (cacheError) {
      console.warn('[suggest-category] Failed to cache suggestion:', cacheError)
    }

    return NextResponse.json({
      categoryId: suggestion.categoryId,
      categoryLabel: suggestion.categoryLabel,
      confidence: suggestion.confidence,
      source: suggestion.source,
    })
  } catch (error) {
    console.error('Error in POST /api/products/suggest-category:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
