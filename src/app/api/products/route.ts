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

    const { data: products, error, count } = await query

    if (error) {
      console.error('Error fetching products:', error)
      throw error
    }

    // Get unique categories for filter dropdown
    const { data: categories } = await supabase
      .from('products')
      .select('category_name')
      .eq('user_id', user.id)
      .not('category_name', 'is', null)
      .order('category_name')

    const uniqueCategories = [...new Set(categories?.map(c => c.category_name).filter(Boolean))]

    // Process products to add resolved image URLs
    const processedProducts = (products || []).map(product => {
      let resolvedImageUrl = product.primary_image_url; // Default to Lightspeed image
      
      // If product has canonical product with images, use those
      if (product.canonical_products?.product_images && Array.isArray(product.canonical_products.product_images)) {
        const images = product.canonical_products.product_images;
        
        // Find primary image or use first available
        const primaryImage = images.find((img: any) => img.is_primary) || images[0];
        
        if (primaryImage && primaryImage.storage_path) {
          const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
          
          // Use storage_path directly (variants aren't being generated yet)
          // TODO: When image processing is added, use: variants.thumbnail || variants.medium || storage_path
          const imagePath = primaryImage.storage_path;
          
          resolvedImageUrl = `${baseUrl}/storage/v1/object/public/product-images/${imagePath}`;
        }
      }
      
      return {
        ...product,
        resolved_image_url: resolvedImageUrl,
      };
    });

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

