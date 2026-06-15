/**
 * Assign a Lightspeed category to a product and write back to Lightspeed.
 *
 * POST /api/products/set-category
 * Body: { productId: string, categoryId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedCategory } from '@/lib/services/lightspeed'
import { clearCategorySuggestionCacheUpdate } from '@/lib/missing-categories/suggestion-cache'
import { formatCategoryDisplayLabel } from '@/lib/products/category-recognition'

export const dynamic = 'force-dynamic'

export interface SetCategoryResult {
  productId: string
  categoryId: string
  categoryLabel: string
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
    const categoryId = typeof body?.categoryId === 'string' ? body.categoryId.trim() : ''

    if (!productId) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
    }
    if (!categoryId || categoryId === '0') {
      return NextResponse.json({ error: 'categoryId is required.' }, { status: 400 })
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, lightspeed_item_id, lightspeed_category_id')
      .eq('id', productId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (productError) {
      console.error('[set-category] Failed to load product:', productError)
      return NextResponse.json({ error: 'Failed to load product.' }, { status: 500 })
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    const client = createLightspeedClient(user.id)
    let lightspeedAvailable = true
    let categories: LightspeedCategory[] = []

    try {
      categories = await client.getAllCategories({ archived: 'false' })
    } catch (error) {
      console.warn('[set-category] Could not load Lightspeed categories:', error)
      lightspeedAvailable = false
    }

    const matched = categories.find((row) => String(row.categoryID) === categoryId) ?? null
    if (!matched) {
      return NextResponse.json({ error: 'Category not found in Lightspeed.' }, { status: 400 })
    }

    const categoryLabel = formatCategoryDisplayLabel(matched)
    const categoryName = matched.name
    const fullCategoryPath = matched.fullPathName || matched.name

    let updatedLightspeed = false
    if (product.lightspeed_item_id && lightspeedAvailable) {
      await client.updateItem(String(product.lightspeed_item_id), {
        categoryID: categoryId,
      })
      updatedLightspeed = true
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({
        lightspeed_category_id: categoryId,
        category_name: categoryName,
        full_category_path: fullCategoryPath,
        updated_at: new Date().toISOString(),
        ...clearCategorySuggestionCacheUpdate(),
      })
      .eq('id', product.id)
      .eq('user_id', user.id)

    if (updateError) throw updateError

    if (product.lightspeed_item_id) {
      await supabase
        .from('lightspeed_inventory')
        .update({
          category_id: categoryId,
          category_name: categoryName,
          category_path: fullCategoryPath,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('lightspeed_item_id', product.lightspeed_item_id)
    }

    const result: SetCategoryResult = {
      productId: product.id,
      categoryId,
      categoryLabel,
      updatedLightspeed,
    }

    return NextResponse.json({ success: true, lightspeedAvailable, result })
  } catch (error) {
    console.error('Error in POST /api/products/set-category:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
