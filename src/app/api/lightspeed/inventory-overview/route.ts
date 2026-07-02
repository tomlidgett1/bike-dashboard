/**
 * Lightspeed Inventory Overview API
 * 
 * GET /api/lightspeed/inventory-overview
 * 
 * Fetches products from the Lightspeed inventory mirror organized by categories.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface MirrorProductRow {
  id: string
  lightspeed_item_id: string
  system_sku: string | null
  description: string | null
  model_year: string | null
  upc: string | null
  category_id: string | null
  category_name: string | null
  category_path: string | null
  brand_id: string | null
  default_price: number | string | null
  total_qoh: number | string | null
  total_sellable: number | string | null
  stock_data: unknown
}

interface SyncedProductRow {
  lightspeed_item_id: string | null
}

interface CategoryPreferenceRow {
  category_id: string
  is_enabled: boolean
  last_synced_at: string | null
}

interface OverviewProduct {
  id: string
  itemId: string
  name: string | null
  sku: string | null
  modelYear: string | null
  upc: string | null
  categoryId: string | null
  categoryName: string
  manufacturerId: string | null
  price: number
  totalQoh: number
  totalSellable: number
  stockData: unknown
  isSynced: boolean
}

interface OverviewCategoryBucket {
  categoryId: string
  name: string
  productCount: number
  syncedCount?: number
  products: OverviewProduct[]
}

type CategorySyncStatus = 'not_synced' | 'partial' | 'fully_synced'

interface OverviewCategory {
  categoryId: string
  name: string
  totalProducts: number
  syncedProducts: number
  notSyncedProducts: number
  products: OverviewProduct[]
  syncStatus: CategorySyncStatus
  autoSyncEnabled: boolean
  lastSyncedAt: string | null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

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

    // Fetch all active products from the inventory mirror (paginate beyond the Supabase default limit).
    let allLsProducts: MirrorProductRow[] = []
    const pageSize = 1000
    let page = 0
    let hasMore = true

    while (hasMore) {
      const from = page * pageSize
      const to = from + pageSize - 1

      const { data, error: productsError } = await supabase
        .from('lightspeed_inventory')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('description', { ascending: true })
        .range(from, to)

      if (productsError) {
        console.error('[Inventory Overview] Error fetching products:', productsError)
        return NextResponse.json(
          { error: 'Failed to fetch inventory' },
          { status: 500 }
        )
      }

      if (data && data.length > 0) {
        allLsProducts = [...allLsProducts, ...(data as MirrorProductRow[])]
        page++
        hasMore = data.length === pageSize
      } else {
        hasMore = false
      }
    }

    console.log(`[Inventory Overview] Fetched ${allLsProducts.length} products from lightspeed_inventory`)

    // Fetch synced products from products table to determine sync status
    // Also need to paginate this
    let syncedProducts: SyncedProductRow[] = []
    page = 0
    hasMore = true

    while (hasMore) {
      const from = page * pageSize
      const to = from + pageSize - 1

      const { data } = await supabase
        .from('products')
        .select('lightspeed_item_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .range(from, to)

      if (data && data.length > 0) {
        syncedProducts = [...syncedProducts, ...(data as SyncedProductRow[])]
        page++
        hasMore = data.length === pageSize
      } else {
        hasMore = false
      }
    }

    console.log(`[Inventory Overview] Fetched ${syncedProducts.length} synced products from products table`)

    const syncedItemIds = new Set(syncedProducts.map(p => p.lightspeed_item_id).filter(Boolean))

    // Fetch category preferences for auto-sync status.
    const categoryPreferencesMap = new Map<string, { isEnabled: boolean, lastSyncedAt: string | null }>()

    try {
      // Fetch category preferences
      const { data: prefs } = await supabase
        .from('lightspeed_category_sync_preferences')
        .select('category_id, is_enabled, last_synced_at')
        .eq('user_id', user.id)

      ;(prefs as CategoryPreferenceRow[] | null)?.forEach(pref => {
        categoryPreferencesMap.set(pref.category_id, {
          isEnabled: pref.is_enabled,
          lastSyncedAt: pref.last_synced_at,
        })
      })

      console.log(`[Inventory Overview] Fetched ${prefs?.length || 0} category preferences`)
    } catch (error) {
      console.error('[Inventory Overview] Error fetching category preferences:', error)
      // Continue without preferences.
    }

    // Separate products into synced and not synced
    const notSyncedProducts: OverviewProduct[] = []
    const syncedProductsList: OverviewProduct[] = []

    console.log(`[Inventory Overview] Processing ${allLsProducts.length} products...`)

    allLsProducts.forEach(product => {
      const isSynced = syncedItemIds.has(product.lightspeed_item_id)
      const productData = {
        id: product.id,
        itemId: product.lightspeed_item_id,
        name: product.description,
        sku: product.system_sku,
        modelYear: product.model_year,
        upc: product.upc,
        categoryId: product.category_id,
        categoryName: product.category_path || product.category_name || `Category ${product.category_id || 'Unknown'}`,
        manufacturerId: product.brand_id,
        price: toNumber(product.default_price),
        totalQoh: toNumber(product.total_qoh),
        totalSellable: toNumber(product.total_sellable),
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
    const notSyncedCategoryMap = new Map<string, OverviewCategoryBucket & { syncedCount: number }>()

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
    const syncedCategoryMap = new Map<string, OverviewCategoryBucket>()

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
    const allCategoriesMap = new Map<string, OverviewCategory>()

    // Add not synced categories
    notSyncedCategories.forEach(cat => {
      const prefs = categoryPreferencesMap.get(cat.categoryId)
      
      allCategoriesMap.set(cat.categoryId, {
        categoryId: cat.categoryId,
        name: cat.name,
        totalProducts: cat.productCount,
        syncedProducts: cat.syncedCount || 0,
        notSyncedProducts: cat.productCount,
        products: cat.products,
        syncStatus: cat.syncedCount > 0 ? 'partial' : 'not_synced',
        autoSyncEnabled: prefs?.isEnabled || false,
        lastSyncedAt: prefs?.lastSyncedAt || null,
      })
    })

    // Add/update with synced categories
    syncedCategories.forEach(cat => {
      const existing = allCategoriesMap.get(cat.categoryId)
      const prefs = categoryPreferencesMap.get(cat.categoryId)
      
      if (existing) {
        existing.syncedProducts = cat.productCount
        existing.totalProducts = existing.notSyncedProducts + cat.productCount
        existing.products = [...existing.products, ...cat.products]
        existing.syncStatus = existing.notSyncedProducts > 0 ? 'partial' : 'fully_synced'
        existing.autoSyncEnabled = prefs?.isEnabled || false
        existing.lastSyncedAt = prefs?.lastSyncedAt || null
      } else {
        allCategoriesMap.set(cat.categoryId, {
          categoryId: cat.categoryId,
          name: cat.name,
          totalProducts: cat.productCount,
          syncedProducts: cat.productCount,
          notSyncedProducts: 0,
          products: cat.products,
          syncStatus: 'fully_synced',
          autoSyncEnabled: prefs?.isEnabled || false,
          lastSyncedAt: prefs?.lastSyncedAt || null,
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
    const totalProducts = allLsProducts.length
    const totalStock = allLsProducts.reduce((sum, product) => sum + toNumber(product.total_qoh), 0)

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
