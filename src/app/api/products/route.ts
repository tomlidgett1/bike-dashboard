/**
 * Products API
 * 
 * GET /api/products - Fetch all products for authenticated user
 * 
 * Optimized with pagination, sorting, and filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const sortBy = searchParams.get('sortBy') || 'last_synced_at'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const categoryFilter = searchParams.get('category') || ''
    const stockFilter = searchParams.get('stock') || 'all' // all, in-stock, low-stock
    const statusFilter = searchParams.get('status') || 'all' // all, active, inactive

    // Calculate offset
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build query - include canonical product images with thumbnail_url
    let query = supabase
      .from('products')
      .select(`
        *,
        canonical_products!canonical_product_id (
          id,
          upc,
          normalized_name,
          product_images!canonical_product_id (
            id,
            storage_path,
            thumbnail_url,
            card_url,
            cloudinary_url,
            is_primary,
            approval_status,
            variants,
            formats
          )
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)

    // Apply status filter
    if (statusFilter === 'active') {
      query = query.eq('is_active', true)
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false)
    }
    // If 'all', no filter applied

    // Apply search filter
    if (search) {
      query = query.or(`description.ilike.%${search}%,custom_sku.ilike.%${search}%,system_sku.ilike.%${search}%`)
    }

    // Apply category filter
    if (categoryFilter) {
      query = query.eq('category_name', categoryFilter)
    }

    // Apply stock filter
    if (stockFilter === 'in-stock') {
      query = query.gt('qoh', 0)
    } else if (stockFilter === 'low-stock') {
      query = query.gt('qoh', 0).lte('qoh', 'reorder_point')
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    query = query.range(from, to)

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

    // Process products to add resolved image URLs from product_images table
    const processedProducts = (data || []).map((product, idx) => {
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
        const approvedImages = product.canonical_products.product_images.filter(
          (img: any) => img.approval_status === 'approved' || img.approval_status === null
        );
        
        // Find primary image or use first approved
        const primaryImage = approvedImages.find((img: any) => img.is_primary) || approvedImages[0];
        
        if (primaryImage) {
          // Use thumbnail_url for table display (optimized 100px)
          resolvedImageUrl = primaryImage.thumbnail_url || 
                            primaryImage.card_url || 
                            primaryImage.cloudinary_url;
        }
      }
      
      // Fallback to cached_image_url (populated by trigger)
      if (!resolvedImageUrl) {
        resolvedImageUrl = product.cached_image_url || product.cached_thumbnail_url;
      }
      
      return {
        ...product,
        resolved_image_url: resolvedImageUrl,
      };
    });

    console.log('[Products API] Total products:', processedProducts.length)
    console.log('[Products API] Products with images:', processedProducts.filter(p => p.resolved_image_url).length)

    return NextResponse.json({
      products: processedProducts,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      categories: uniqueCategories,
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

