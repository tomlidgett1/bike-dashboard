/**
 * Suggest a brand for a product (no Lightspeed write).
 * Returns cached suggestion when still valid; persists new results.
 *
 * POST /api/products/suggest-brand
 * Body: { productId: string }
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

export const dynamic = 'force-dynamic'

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
      console.error('[suggest-brand] Failed to load product:', productError)
      return NextResponse.json({ error: 'Failed to load product.' }, { status: 500 })
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    const row = product as BrandSuggestionProductRow & { manufacturer_name?: string | null }

    if (row.manufacturer_name?.trim()) {
      return NextResponse.json({
        brand: row.manufacturer_name.trim(),
        manufacturerId: null,
        confidence: 'high',
        source: 'none',
      })
    }

    const cached = readCachedBrandSuggestion(row)
    if (cached !== undefined) {
      return NextResponse.json({
        brand: cached?.brand ?? null,
        manufacturerId: cached?.manufacturerId ?? null,
        confidence: cached?.confidence ?? 'none',
        source: cached?.source ?? 'none',
      })
    }

    const productName = (row.display_name || row.description || '').trim()
    if (!productName) {
      return NextResponse.json({ error: 'Product has no name to identify a brand from.' }, { status: 400 })
    }

    let manufacturers: LightspeedManufacturer[] = []
    try {
      const client = createLightspeedClient(user.id)
      manufacturers = await client.getAllManufacturers()
    } catch (error) {
      console.warn('[suggest-brand] Could not load Lightspeed manufacturers:', error)
    }

    const knownBrandNames = manufacturers
      .map((m) => (m.name || '').trim())
      .filter(Boolean)
      .slice(0, 400)

    const suggestion = await computeBrandSuggestion(row, manufacturers, knownBrandNames)

    const { error: cacheError } = await supabase
      .from('products')
      .update(brandSuggestionCacheUpdate(row, suggestion))
      .eq('id', row.id)
      .eq('user_id', user.id)

    if (cacheError) {
      console.warn('[suggest-brand] Failed to cache suggestion:', cacheError)
    }

    return NextResponse.json({
      brand: suggestion.brand,
      manufacturerId: suggestion.manufacturerId,
      confidence: suggestion.confidence,
      source: suggestion.source,
    })
  } catch (error) {
    console.error('Error in POST /api/products/suggest-brand:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
