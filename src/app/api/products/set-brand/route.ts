/**
 * Set a product brand manually and write back to Lightspeed.
 *
 * POST /api/products/set-brand
 * Body: { productId: string, brandName: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedManufacturer } from '@/lib/services/lightspeed'
import { clearBrandSuggestionCacheUpdate } from '@/lib/missing-brands/suggestion-cache'

export const dynamic = 'force-dynamic'

export interface SetBrandResult {
  productId: string
  brand: string
  manufacturerId: string | null
  createdManufacturer: boolean
  updatedLightspeed: boolean
  error?: string
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
    const productId = typeof body?.productId === 'string' ? body.productId : ''
    const brandName = typeof body?.brandName === 'string' ? body.brandName.trim() : ''

    if (!productId) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
    }
    if (!brandName) {
      return NextResponse.json({ error: 'brandName is required.' }, { status: 400 })
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, lightspeed_item_id, manufacturer_name, manufacturer_id')
      .eq('id', productId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (productError) {
      console.error('[set-brand] Failed to load product:', productError)
      return NextResponse.json({ error: 'Failed to load product.' }, { status: 500 })
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    const client = createLightspeedClient(user.id)
    let lightspeedAvailable = true
    let manufacturers: LightspeedManufacturer[] = []

    // Prefer a filtered lookup — loading every manufacturer can hang for a long time.
    const manufacturerFilter = `~,%${brandName.replace(/%/g, '').trim()}%`
    try {
      manufacturers = await client.getAllManufacturers({ name: manufacturerFilter })
    } catch (error) {
      console.warn('[set-brand] Could not search Lightspeed manufacturers:', error)
      lightspeedAvailable = false
    }

    const brandKey = brandName.toLowerCase()
    let matched =
      manufacturers.find((m) => (m.name || '').trim().toLowerCase() === brandKey) ??
      null
    let createdManufacturer = false

    if (!matched && lightspeedAvailable) {
      try {
        const created = await client.createManufacturer(brandName)
        matched = created
        createdManufacturer = true
      } catch (createError) {
        // Race: brand may already exist — retry a tighter search once.
        console.warn('[set-brand] createManufacturer failed, re-searching:', createError)
        try {
          manufacturers = await client.getAllManufacturers({ name: manufacturerFilter })
          matched =
            manufacturers.find((m) => (m.name || '').trim().toLowerCase() === brandKey) ??
            manufacturers[0] ??
            null
        } catch (searchError) {
          console.warn('[set-brand] manufacturer re-search failed:', searchError)
          lightspeedAvailable = false
        }
      }
    }

    const manufacturerId = matched ? String(matched.manufacturerID) : null
    const resolvedBrandName = matched?.name || brandName

    let updatedLightspeed = false
    if (manufacturerId && product.lightspeed_item_id && lightspeedAvailable) {
      await client.updateItem(String(product.lightspeed_item_id), {
        manufacturerID: manufacturerId,
      })
      updatedLightspeed = true
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({
        manufacturer_name: resolvedBrandName,
        manufacturer_id: manufacturerId,
        updated_at: new Date().toISOString(),
        ...clearBrandSuggestionCacheUpdate(),
      })
      .eq('id', product.id)
      .eq('user_id', user.id)

    if (updateError) throw updateError

    if (product.lightspeed_item_id) {
      await supabase
        .from('lightspeed_inventory')
        .update({ brand_id: manufacturerId, brand_name: resolvedBrandName })
        .eq('user_id', user.id)
        .eq('lightspeed_item_id', product.lightspeed_item_id)
    }

    const result: SetBrandResult = {
      productId: product.id,
      brand: resolvedBrandName,
      manufacturerId,
      createdManufacturer,
      updatedLightspeed,
    }

    return NextResponse.json({ success: true, lightspeedAvailable, result })
  } catch (error) {
    console.error('Error in POST /api/products/set-brand:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
