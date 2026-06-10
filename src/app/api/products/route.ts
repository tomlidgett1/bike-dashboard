/**
 * Products API
 * 
 * GET /api/products - Fetch all products for authenticated user
 * 
 * Optimized with pagination, sorting, and filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCloudinaryImageUrl, extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms'
import { getMarketplaceReadiness } from '@/lib/marketplace/product-readiness'
import {
  LIGHTSPEED_SOURCE_OR_FILTER,
  MANUAL_SOURCE_OR_FILTER,
} from '@/lib/products/catalog-helpers'

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, (match) => `\\${match}`).replace(/,/g, ' ')
}

function buildSearchOr(term: string) {
  const escaped = escapeSearchTerm(term)
  const fields = [
    'description',
    'display_name',
    'custom_sku',
    'system_sku',
    'lightspeed_item_id',
    'manufacturer_name',
    'category_name',
    'full_category_path',
    'marketplace_category',
    'marketplace_subcategory',
    'marketplace_level_3_category',
    'model_year',
    'listing_status',
    'listing_source',
  ]

  return fields.map((field) => `${field}.ilike.%${escaped}%`).join(',')
}

type ProductImageRow = {
  id: string
  cloudinary_public_id?: string | null
  cloudinary_url?: string | null
  external_url?: string | null
  is_primary?: boolean | null
  approval_status?: string | null
  sort_order?: number | null
  source?: string | null
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
    const lsCategoryId = searchParams.get('ls_category_id') || ''
    const stockFilter = searchParams.get('stock') || 'all' // all, in-stock, low-stock
    const statusFilter = searchParams.get('status') || 'all' // all, active, inactive
    const imageFilter = searchParams.get('image') || 'all' // all, approved, needs-images
    const sourceFilter = searchParams.get('source') || 'all' // all, lightspeed, manual
    const brandFilter = searchParams.get('brand') || '' // brand name, or __none__ for missing brand
    const listingTypeFilter = searchParams.get('listing_type') || '' // e.g. private_listing
    const productIds = (searchParams.get('ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    // Calculate offset
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build query - include canonical product images with thumbnail_url
    let query = supabase
      .from('products')
      .select(`
        *,
        product_images!product_id (
          id,
          cloudinary_public_id,
          cloudinary_url,
          external_url,
          is_primary,
          approval_status,
          sort_order,
          source
        ),
        canonical_products!canonical_product_id (
          id,
          upc,
          normalized_name,
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
      `, { count: 'exact' })
      .eq('user_id', user.id)

    if (productIds.length > 0) {
      query = query.in('id', productIds)
    }

    // Apply status filter
    if (statusFilter === 'active') {
      query = query.eq('is_active', true)
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false)
    }
    // If 'all', no filter applied

    // Apply search filter. Each token must match at least one searchable field,
    // which makes multi-word searches far more useful than a single broad OR.
    if (search) {
      const terms = search
        .trim()
        .split(/\s+/)
        .filter(Boolean)

      for (const term of terms) {
        query = query.or(buildSearchOr(term))
      }
    }

    // Apply category filter
    if (lsCategoryId) {
      query = query.eq('lightspeed_category_id', lsCategoryId)
    } else if (categoryFilter) {
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
      query = query.gt('qoh', 0).lte('qoh', 'reorder_point')
    }

    // Apply listing type filter
    if (listingTypeFilter) {
      query = query.eq('listing_type', listingTypeFilter)
    }

    // Lightspeed vs manual / online catalogue (aligned with isLightspeedProduct)
    if (sourceFilter === 'lightspeed') {
      query = query.or(LIGHTSPEED_SOURCE_OR_FILTER)
    } else if (sourceFilter === 'manual') {
      query = query.or(MANUAL_SOURCE_OR_FILTER)
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    const postProcessImageFilter = imageFilter === 'approved' || imageFilter === 'needs-images'

    // Image readiness depends on product + canonical image joins, so when that
    // filter is active we fetch a wider candidate set, resolve readiness, then
    // paginate the filtered result in-memory.
    query = postProcessImageFilter ? query.range(0, 9999) : query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('[Products API] Query error:', error)
      throw error
    }

    console.log(`[Products API] Query returned ${data?.length || 0} products`)
    
    // Check first product's raw data
    if (data && data.length > 0) {
      const first = data[0]
      console.log('[Products API] First product raw data:', {
        id: first.id,
        canonical_product_id: first.canonical_product_id,
        has_canonical_products_join: !!first.canonical_products,
        canonical_products_keys: first.canonical_products ? Object.keys(first.canonical_products) : [],
      })
    }

    // Get unique categories for filter dropdown
    const { data: categories } = await supabase
      .from('products')
      .select('category_name')
      .eq('user_id', user.id)
      .not('category_name', 'is', null)
      .order('category_name')

    const uniqueCategories = [...new Set(categories?.map(c => c.category_name).filter(Boolean))]

    // Get unique brands for filter dropdown
    const { data: brandRows } = await supabase
      .from('products')
      .select('manufacturer_name')
      .eq('user_id', user.id)
      .not('manufacturer_name', 'is', null)
      .order('manufacturer_name')

    const uniqueBrands = [...new Set(
      (brandRows ?? [])
        .map(row => (row.manufacturer_name ?? '').trim())
        .filter(Boolean)
    )]

    // Process products to add resolved image URLs from product_images table
    let processedProducts = (data || []).map((product, idx) => {
      let resolvedImageUrl = null;
      
      // Debug first product
      if (idx === 0) {
        console.log('[Products API] First product debug:', {
          has_canonical_id: !!product.canonical_product_id,
          canonical_id: product.canonical_product_id,
          has_canonical_join: !!product.canonical_products,
          has_product_images: !!product.canonical_products?.product_images,
          image_count: product.canonical_products?.product_images?.length || 0,
          cached_image: product.cached_image_url ? 'YES' : 'NO',
          cached_thumbnail: product.cached_thumbnail_url ? 'YES' : 'NO',
        })
        
        if (product.canonical_products?.product_images?.[0]) {
          const img = product.canonical_products.product_images[0]
          console.log('[Products API] First image data:', {
            thumbnail_url: img.thumbnail_url || 'NULL',
            card_url: img.card_url || 'NULL',
            cloudinary_url: img.cloudinary_url || 'NULL',
            approval_status: img.approval_status,
            is_primary: img.is_primary,
          })
        }
      }
      
      // Get approved images from canonical product_images
      if (product.canonical_products?.product_images && Array.isArray(product.canonical_products.product_images)) {
        const canonicalProductImages = product.canonical_products.product_images as ProductImageRow[]
        const approvedImages = canonicalProductImages.filter(
          (img) => img.approval_status === 'approved' || img.approval_status === null
        );
        
        // Find primary image or use first approved
        const primaryImage = approvedImages.find((img) => img.is_primary) || approvedImages[0];
        
        if (primaryImage) {
          // Compute the 100px thumbnail from the public_id (single source of truth)
          const publicId = primaryImage.cloudinary_public_id || extractCloudinaryPublicId(primaryImage.cloudinary_url);
          resolvedImageUrl = buildCloudinaryImageUrl(publicId, 'thumbnail') ||
                            primaryImage.cloudinary_url ||
                            primaryImage.external_url;
        }
      }
      
      // Fallback to cached URLs populated by triggers. Prefer the tiny thumbnail
      // so catalogue tables do not pull larger card/hero images.
      if (!resolvedImageUrl) {
        resolvedImageUrl = product.cached_thumbnail_url || product.cached_image_url;
      }
      
      const productImages = Array.isArray(product.product_images)
        ? product.product_images
        : [];
      const canonicalImages = Array.isArray(
        product.canonical_products?.product_images
      )
        ? product.canonical_products.product_images
        : [];

      const marketplace_readiness = getMarketplaceReadiness({
        is_active: product.is_active ?? false,
        listing_status: product.listing_status ?? null,
        listing_type: product.listing_type ?? null,
        qoh: product.qoh ?? null,
        selected_product_image_id: product.selected_product_image_id ?? null,
        productImages,
        canonicalImages,
      });

      const canonical = product.canonical_products as {
        marketplace_category?: string | null
        marketplace_subcategory?: string | null
        marketplace_level_3_category?: string | null
      } | null

      return {
        ...product,
        resolved_image_url: resolvedImageUrl,
        marketplace_readiness,
        brand: product.manufacturer_name || null,
        marketplace_category:
          product.marketplace_category ?? canonical?.marketplace_category ?? null,
        marketplace_subcategory:
          product.marketplace_subcategory ?? canonical?.marketplace_subcategory ?? null,
        marketplace_level_3_category:
          product.marketplace_level_3_category ??
          canonical?.marketplace_level_3_category ??
          null,
      };
    });

    if (postProcessImageFilter) {
      processedProducts = processedProducts.filter((product) => {
        const needsImage = product.marketplace_readiness.blockers.some(
          (blocker: { id: string }) => blocker.id === 'no_approved_image',
        )
        return imageFilter === 'approved' ? !needsImage : needsImage
      })
    }

    const filteredCount = postProcessImageFilter ? processedProducts.length : count || 0
    const paginatedProducts = postProcessImageFilter
      ? processedProducts.slice(from, to + 1)
      : processedProducts

    console.log('[Products API] Total products:', paginatedProducts.length)
    console.log('[Products API] Products with images:', paginatedProducts.filter(p => p.resolved_image_url).length)

    return NextResponse.json({
      products: paginatedProducts,
      pagination: {
        page,
        pageSize,
        total: filteredCount,
        totalPages: Math.ceil(filteredCount / pageSize),
      },
      categories: uniqueCategories,
      brands: uniqueBrands,
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

