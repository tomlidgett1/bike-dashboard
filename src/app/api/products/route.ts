/**
 * Products API
 * 
 * GET /api/products - Fetch all products for authenticated user
 * 
 * Optimized with pagination, sorting, and filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMarketplaceReadiness } from '@/lib/marketplace/product-readiness'
import {
  LIGHTSPEED_SOURCE_OR_FILTER,
  MANUAL_SOURCE_OR_FILTER,
  fetchDistinctProductFilterValues,
} from '@/lib/products/catalog-helpers'
import { enrichProductsWithVariantMetadata } from '@/lib/variants/enrich-product-variants'

const PRODUCT_LIST_SELECT = `
  id,
  lightspeed_item_id,
  system_sku,
  custom_sku,
  description,
  category_name,
  full_category_path,
  lightspeed_category_id,
  marketplace_category,
  marketplace_subcategory,
  marketplace_level_3_category,
  manufacturer_name,
  price,
  default_cost,
  qoh,
  sellable,
  reorder_point,
  model_year,
  primary_image_url,
  cached_image_url,
  cached_thumbnail_url,
  canonical_product_id,
  last_synced_at,
  is_active,
  listing_source,
  listing_status,
  listing_type,
  is_bicycle,
  bike_specs,
  display_name,
  product_description,
  product_specs,
  sub_description,
  selected_product_image_id,
  variant_group_id,
  variant_master_title,
  variant_hidden_from_grid,
  discount_percent,
  discount_active,
  discount_ends_at,
  sale_price,
  created_at
`

const PRODUCT_OPTIMIZE_SELECT = `
  ${PRODUCT_LIST_SELECT},
  canonical_products!canonical_product_id (
    id,
    manufacturer,
    upc,
    normalized_name,
    image_review_search_query,
    product_images!canonical_product_id (
      id,
      cloudinary_public_id,
      cloudinary_url,
      external_url,
      is_primary,
      approval_status,
      sort_order,
      source
    )
  )
`

type ProductSearchRow = {
  product_id: string
  relevance: number
}

type ProductListRow = Record<string, unknown> & {
  id: string
  cached_thumbnail_url?: string | null
  cached_image_url?: string | null
  primary_image_url?: string | null
  is_active?: boolean | null
  listing_status?: string | null
  listing_type?: string | null
  qoh?: number | null
  selected_product_image_id?: string | null
  manufacturer_name?: string | null
  created_at?: string | null
  variant_group_id?: string | null
  variant_master_title?: string | null
  variant_hidden_from_grid?: boolean | null
}

export async function GET(request: NextRequest) {
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const categoryFilter = searchParams.get('category') || ''
    const marketplaceLevel1 = searchParams.get('marketplace_level1') || ''
    const marketplaceLevel2 = searchParams.get('marketplace_level2') || ''
    const lsCategoryId = searchParams.get('ls_category_id') || ''
    const stockFilter = searchParams.get('stock') || 'all' // all, in-stock, low-stock
    const statusFilter = searchParams.get('status') || 'all' // all, active, inactive
    const imageFilter = searchParams.get('image') || 'all' // all, approved, needs-images
    const readinessFilter = searchParams.get('readiness') || 'all' // all, live, needs-optimisation
    const sourceFilter = searchParams.get('source') || 'all' // all, lightspeed, manual
    const saleFilter = searchParams.get('sale') || 'all' // all, on-sale
    const brandFilter = searchParams.get('brand') || '' // brand name, or __none__ for missing brand
    const listingTypeFilter = searchParams.get('listing_type') || '' // e.g. private_listing
    const includeFilterOptions = searchParams.get('includeFilters') !== 'false'
    const includeOptimizeCanonical = searchParams.get('includeOptimizeCanonical') === 'true'
    const trimmedSearch = search.trim()
    const productIds = (searchParams.get('ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    // Calculate offset
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let searchProductIds: string[] | null = null
    let searchRank = new Map<string, number>()

    if (trimmedSearch && productIds.length === 0) {
      const { data: searchRows, error: searchError } = await supabase.rpc(
        'search_user_products_catalog',
        {
          p_user_id: user.id,
          p_search: trimmedSearch,
          p_limit: 10000,
        },
      )

      if (searchError) {
        console.error('[Products API] Search error:', searchError)
        throw searchError
      }

      const rows = (searchRows ?? []) as ProductSearchRow[]
      searchProductIds = rows.map((row) => row.product_id)
      searchRank = new Map(rows.map((row, index) => [row.product_id, row.relevance || rows.length - index]))

      if (searchProductIds.length === 0) {
        return NextResponse.json({
          products: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
          },
          ...(includeFilterOptions ? { categories: [], brands: [] } : {}),
        })
      }
    }

    const hasAdditionalFilters = Boolean(
      categoryFilter ||
      marketplaceLevel1 ||
      marketplaceLevel2 ||
      lsCategoryId ||
      brandFilter ||
      stockFilter !== 'all' ||
      statusFilter !== 'all' ||
      imageFilter !== 'all' ||
      readinessFilter !== 'all' ||
      sourceFilter !== 'all' ||
      saleFilter !== 'all' ||
      listingTypeFilter
    )
    const useRankedSearchPagination = Boolean(
      searchProductIds && sortBy === 'created_at' && !hasAdditionalFilters
    )
    const searchIdsForQuery = useRankedSearchPagination
      ? searchProductIds?.slice(from, to + 1) ?? null
      : searchProductIds

    if (searchProductIds && searchIdsForQuery?.length === 0) {
      return NextResponse.json({
        products: [],
        pagination: {
          page,
          pageSize,
          total: searchProductIds.length,
          totalPages: Math.ceil(searchProductIds.length / pageSize),
        },
        ...(includeFilterOptions ? { categories: [], brands: [] } : {}),
      })
    }

    // Build query. The list view uses cached image columns so searches do not
    // pay for product_images/canonical_products joins on every keystroke.
    const productsTable =
      readinessFilter === 'live'
        ? 'marketplace_ready_products'
        : readinessFilter === 'needs-optimisation'
          ? 'products_needing_marketplace_optimisation'
          : 'products'

    let query = supabase
      .from(productsTable)
      .select((includeOptimizeCanonical ? PRODUCT_OPTIMIZE_SELECT : PRODUCT_LIST_SELECT) as string, { count: 'exact' })
      .eq('user_id', user.id)

    if (productIds.length > 0) {
      query = query.in('id', productIds)
    } else if (searchIdsForQuery) {
      query = query.in('id', searchIdsForQuery)
    }

    // Apply status filter
    if (statusFilter === 'active') {
      query = query.eq('is_active', true)
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false)
    }
    // If 'all', no filter applied

    // Apply category filters. Canonical Yellow Jersey L1/L2 take precedence
    // over provider Lightspeed category_name filtering.
    if (marketplaceLevel1) {
      query = query.eq('marketplace_category', marketplaceLevel1)
    }
    if (marketplaceLevel2) {
      query = query.eq('marketplace_subcategory', marketplaceLevel2)
    }
    if (lsCategoryId) {
      query = query.eq('lightspeed_category_id', lsCategoryId)
    } else if (categoryFilter && !marketplaceLevel1 && !marketplaceLevel2) {
      query = query.eq('category_name', categoryFilter)
    }

    // Apply brand filter
    if (brandFilter === '__none__') {
      query = query.or('manufacturer_name.is.null,manufacturer_name.eq.')
    } else if (brandFilter) {
      query = query.eq('manufacturer_name', brandFilter)
    }

    // Apply stock filter
    if (stockFilter === 'in-stock') {
      query = query.gt('qoh', 0)
    } else if (stockFilter === 'low-stock') {
      // Column-vs-column compare: qoh <= reorder_point (PostgREST cannot use .lte('qoh', 'reorder_point')).
      query = query.or('and(qoh.gt.0,reorder_point.gte.qoh)')
    }

    // Apply listing type filter
    if (listingTypeFilter) {
      query = query.eq('listing_type', listingTypeFilter)
    }

    if (imageFilter === 'approved') {
      query = query.or('cached_image_url.not.is.null,cached_thumbnail_url.not.is.null')
    } else if (imageFilter === 'needs-images') {
      query = query.is('cached_image_url', null).is('cached_thumbnail_url', null)
    }

    // Lightspeed vs manual / online catalogue (aligned with isLightspeedProduct)
    if (sourceFilter === 'lightspeed') {
      query = query.or(LIGHTSPEED_SOURCE_OR_FILTER)
    } else if (sourceFilter === 'manual') {
      query = query.or(MANUAL_SOURCE_OR_FILTER)
    }

    if (saleFilter === 'on-sale') {
      const nowIso = new Date().toISOString()
      query = query
        .eq('discount_active', true)
        .gt('discount_percent', 0)
        .or(`discount_ends_at.is.null,discount_ends_at.gt.${nowIso}`)
    }

    // Apply sorting
    if (useRankedSearchPagination) {
      // Already narrowed to the ranked page IDs returned by the search RPC.
    } else if (searchProductIds && sortBy === 'created_at') {
      query = query.range(0, Math.min(searchProductIds.length, 10000) - 1)
    } else {
      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(from, to)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[Products API] Query error:', error)
      throw error
    }

    let uniqueCategories: string[] | undefined
    let uniqueBrands: string[] | undefined

    if (includeFilterOptions) {
      ;[uniqueCategories, uniqueBrands] = await Promise.all([
        fetchDistinctProductFilterValues(supabase, user.id, 'category_name'),
        fetchDistinctProductFilterValues(supabase, user.id, 'manufacturer_name'),
      ])
    }

    let processedProducts = ((data || []) as unknown as ProductListRow[]).map((product) => {
      const resolvedImageUrl = product.cached_thumbnail_url || product.cached_image_url || product.primary_image_url || null;
      const hasApprovedImage = Boolean(product.cached_thumbnail_url || product.cached_image_url);

      const marketplace_readiness = getMarketplaceReadiness({
        is_active: product.is_active ?? false,
        listing_status: product.listing_status ?? null,
        listing_type: product.listing_type ?? null,
        qoh: product.qoh ?? null,
        hasApprovedImage,
        selected_product_image_id: product.selected_product_image_id ?? null,
      });

      return {
        ...product,
        resolved_image_url: resolvedImageUrl,
        marketplace_readiness,
        brand: product.manufacturer_name || null,
      };
    });

    if (searchProductIds && sortBy === 'created_at') {
      processedProducts = processedProducts.sort((a, b) => {
        const rankDelta = (searchRank.get(b.id) ?? 0) - (searchRank.get(a.id) ?? 0)
        if (rankDelta !== 0) return rankDelta
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      })
    }

    const useInMemorySearchPagination = Boolean(searchProductIds && sortBy === 'created_at' && !useRankedSearchPagination)
    const filteredCount = useRankedSearchPagination
      ? searchProductIds?.length ?? 0
      : useInMemorySearchPagination
        ? count || processedProducts.length
        : count || 0
    const paginatedProducts = useInMemorySearchPagination
      ? processedProducts.slice(from, to + 1)
      : processedProducts

    const productsWithVariants = await enrichProductsWithVariantMetadata(
      supabase,
      paginatedProducts,
    )

    return NextResponse.json({
      products: productsWithVariants,
      pagination: {
        page,
        pageSize,
        total: filteredCount,
        totalPages: Math.ceil(filteredCount / pageSize),
      },
      ...(includeFilterOptions ? { categories: uniqueCategories, brands: uniqueBrands } : {}),
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

