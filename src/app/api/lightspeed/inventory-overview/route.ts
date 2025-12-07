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
    const { data: allLsProducts, error: productsError } = await supabase
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

    // Fetch synced products from products table to determine sync status
    const { data: syncedProducts } = await supabase
      .from('products')
      .select('lightspeed_item_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const syncedItemIds = new Set(syncedProducts?.map(p => p.lightspeed_item_id) || [])

    // Fetch category names from Lightspeed using our client
    let categoryNamesMap = new Map<string, string>()

    try {
      // Use the Lightspeed client to fetch categories
      const { createLightspeedClient } = await import('@/lib/services/lightspeed')
      const client = createLightspeedClient(user.id)
      const categories = await client.getCategories({ archived: 'false' })
      
      console.log(`[Inventory Overview] Fetched ${categories.length} category names from Lightspeed`)
      
      categories.forEach((cat: any) => {
        categoryNamesMap.set(cat.categoryID, cat.name)
      })
    } catch (error) {
      console.error('[Inventory Overview] Error fetching category names:', error)
      // Continue without category names - will show IDs instead
    }

    // Separate products into synced and not synced
    const notSyncedProducts: any[] = []
    const syncedProductsList: any[] = []

    allLsProducts?.forEach(product => {
      const isSynced = syncedItemIds.has(product.lightspeed_item_id)
      const productData = {
        id: product.id,
        itemId: product.lightspeed_item_id,
        name: product.description,
        sku: product.system_sku,
        modelYear: product.model_year,
        upc: product.upc,
        categoryId: product.category_id,
        categoryName: categoryNamesMap.get(product.category_id || '') || `Category ${product.category_id || 'Unknown'}`,
        manufacturerId: product.manufacturer_id,
        totalQoh: product.total_qoh,
        totalSellable: product.total_sellable,
        stockData: product.stock_data,
        isSynced,
      }

      if (isSynced) {
        syncedProductsList.push(productData)
      } else {
        notSyncedProducts.push(productData)
      }
    })

    // Group not synced products by category
    const notSyncedCategoryMap = new Map<string, {
      categoryId: string
      name: string
      productCount: number
      syncedCount: number
      products: any[]
    }>()

    notSyncedProducts.forEach(product => {
      const categoryId = product.categoryId || 'uncategorized'
      
      if (!notSyncedCategoryMap.has(categoryId)) {
        notSyncedCategoryMap.set(categoryId, {
          categoryId,
          name: product.categoryName,
          productCount: 0,
          syncedCount: 0,
          products: [],
        })
      }

      const category = notSyncedCategoryMap.get(categoryId)!
      category.productCount++
      category.products.push(product)
    })

    // Add synced count to each category
    syncedProductsList.forEach(product => {
      const categoryId = product.categoryId || 'uncategorized'
      const category = notSyncedCategoryMap.get(categoryId)
      if (category) {
        category.syncedCount++
      }
    })

    // Group synced products by category
    const syncedCategoryMap = new Map<string, {
      categoryId: string
      name: string
      productCount: number
      products: any[]
    }>()

    syncedProductsList.forEach(product => {
      const categoryId = product.categoryId || 'uncategorized'
      
      if (!syncedCategoryMap.has(categoryId)) {
        syncedCategoryMap.set(categoryId, {
          categoryId,
          name: product.categoryName,
          productCount: 0,
          products: [],
        })
      }

      const category = syncedCategoryMap.get(categoryId)!
      category.productCount++
      category.products.push(product)
    })

    const notSyncedCategories = Array.from(notSyncedCategoryMap.values())
    const syncedCategories = Array.from(syncedCategoryMap.values())

    // Build unified category list with sync status
    const allCategoriesMap = new Map<string, any>()

    // Add not synced categories
    notSyncedCategories.forEach(cat => {
      allCategoriesMap.set(cat.categoryId, {
        categoryId: cat.categoryId,
        name: cat.name,
        totalProducts: cat.productCount,
        syncedProducts: cat.syncedCount || 0,
        notSyncedProducts: cat.productCount,
        products: cat.products,
        syncStatus: cat.syncedCount > 0 ? 'partial' : 'not_synced',
        lastSyncedAt: null,
      })
    })

    // Add/update with synced categories
    syncedCategories.forEach(cat => {
      const existing = allCategoriesMap.get(cat.categoryId)
      
      if (existing) {
        existing.syncedProducts = cat.productCount
        existing.totalProducts = existing.notSyncedProducts + cat.productCount
        existing.syncStatus = existing.notSyncedProducts > 0 ? 'partial' : 'fully_synced'
      } else {
        allCategoriesMap.set(cat.categoryId, {
          categoryId: cat.categoryId,
          name: cat.name,
          totalProducts: cat.productCount,
          syncedProducts: cat.productCount,
          notSyncedProducts: 0,
          products: cat.products,
          syncStatus: 'fully_synced',
          lastSyncedAt: null,
        })
      }
    })

    // Sort by sync status then name (not synced first, then partial, then fully synced)
    const allCategories = Array.from(allCategoriesMap.values()).sort((a, b) => {
      const statusOrder = { 'not_synced': 0, 'partial': 1, 'fully_synced': 2 }
      const statusDiff = statusOrder[a.syncStatus as keyof typeof statusOrder] - statusOrder[b.syncStatus as keyof typeof statusOrder]
      if (statusDiff !== 0) return statusDiff
      return a.name.localeCompare(b.name)
    })

    // Calculate totals
    const totalProducts = allLsProducts?.length || 0
    const totalStock = allLsProducts?.reduce((sum, p) => sum + (p.total_qoh || 0), 0) || 0

    return NextResponse.json({
      success: true,
      totals: {
        totalProducts,
        totalStock,
        totalSynced: syncedProductsList.length,
        totalNotSynced: notSyncedProducts.length,
      },
      categories: allCategories,
      notSynced: {
        categories: notSyncedCategories,
        products: notSyncedProducts,
      },
      synced: {
        categories: syncedCategories,
        products: syncedProductsList,
      },
    })

  } catch (error) {
    console.error('[Inventory Overview] Error:', error)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}

