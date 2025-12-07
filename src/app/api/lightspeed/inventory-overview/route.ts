/**
 * Lightspeed Inventory Overview API
 * 
 * GET /api/lightspeed/inventory-overview
 * 
 * Fetches products from products_all_ls table organized by categories
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    // Fetch all products from products_all_ls
    const { data: products, error: productsError } = await supabase
      .from('products_all_ls')
      .select('*')
      .eq('user_id', user.id)
      .order('description', { ascending: true })

    if (productsError) {
      console.error('[Inventory Overview] Error fetching products:', productsError)
      return NextResponse.json(
        { error: 'Failed to fetch inventory' },
        { status: 500 }
      )
    }

    // Get categories with product counts
    const categoryMap = new Map<string, {
      categoryId: string
      name: string
      productCount: number
      products: any[]
    }>()

    // Group products by category
    products?.forEach(product => {
      const categoryId = product.category_id || 'uncategorized'
      
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          categoryId,
          name: categoryId === 'uncategorized' ? 'Uncategorized' : `Category ${categoryId}`,
          productCount: 0,
          products: [],
        })
      }

      const category = categoryMap.get(categoryId)!
      category.productCount++
      category.products.push({
        id: product.id,
        itemId: product.lightspeed_item_id,
        name: product.description,
        sku: product.system_sku,
        modelYear: product.model_year,
        upc: product.upc,
        categoryId: product.category_id,
        manufacturerId: product.manufacturer_id,
        totalQoh: product.total_qoh,
        totalSellable: product.total_sellable,
        stockData: product.stock_data,
      })
    })

    const categories = Array.from(categoryMap.values()).sort((a, b) => 
      b.productCount - a.productCount
    )

    // Calculate totals
    const totalProducts = products?.length || 0
    const totalStock = products?.reduce((sum, p) => sum + (p.total_qoh || 0), 0) || 0
    const categoriesCount = categories.length

    return NextResponse.json({
      success: true,
      totals: {
        totalProducts,
        totalStock,
        categoriesCount,
      },
      categories,
      products: products || [],
    })

  } catch (error) {
    console.error('[Inventory Overview] Error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}

