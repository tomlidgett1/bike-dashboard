import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MarketplaceProduct, MarketplaceProductsResponse } from '@/lib/types/marketplace';

// ============================================================
// Marketplace Products API - Public Endpoint
// Enterprise-grade with caching, pagination, and optimization
// ============================================================

// Enterprise-grade caching strategy
export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: Revalidate every 5 minutes for better CDN hit rate

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract query parameters
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const search = searchParams.get('search');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const sortBy = searchParams.get('sortBy') || 'newest';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '24');

    // Create Supabase client (public access, no auth required)
    const supabase = await createClient();

    // Start building query - join with canonical products and images
    let query = supabase
      .from('products')
      .select(`
        id,
        description,
        price,
        marketplace_category,
        marketplace_subcategory,
        qoh,
        model_year,
        created_at,
        user_id,
        canonical_product_id,
        use_custom_image,
        custom_image_url,
        canonical_products!canonical_product_id (
          id,
          upc,
          product_images!canonical_product_id (
            id,
            storage_path,
            is_primary,
            variants,
            formats
          )
        )
      `, { count: 'exact' })
      .eq('is_active', true);

    // Apply category filter
    if (category) {
      query = query.eq('marketplace_category', category);
    }

    // Apply subcategory filter
    if (subcategory && subcategory !== 'All') {
      query = query.eq('marketplace_subcategory', subcategory);
    }

    // Apply price range filters
    if (minPrice) {
      query = query.gte('price', parseFloat(minPrice));
    }
    if (maxPrice) {
      query = query.lte('price', parseFloat(maxPrice));
    }

    // Apply search filter (full-text search on description)
    if (search && search.trim()) {
      query = query.textSearch('description', search.trim(), {
        type: 'websearch',
        config: 'english',
      });
    }

    // Apply sorting
    switch (sortBy) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      console.error('Marketplace products query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    // Calculate pagination metadata
    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;

    // Transform data to marketplace product format with optimized images
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    const products: MarketplaceProduct[] = (data || []).map((product: any) => {
      let primaryImageUrl = null;
      let imageVariants = null;
      let imageFormats = null;
      
      // Priority 1: Custom store image
      if (product.use_custom_image && product.custom_image_url) {
        primaryImageUrl = product.custom_image_url;
      }
      // Priority 2: Canonical product images
      else if (product.canonical_products?.product_images) {
        const primaryImage = product.canonical_products.product_images.find(
          (img: any) => img.is_primary
        );
        
        if (primaryImage) {
          primaryImageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.storage_path}`;
          imageVariants = primaryImage.variants;
          imageFormats = primaryImage.formats;
        }
      }
      
      return {
        id: product.id,
        description: product.description,
        price: parseFloat(product.price) || 0,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        primary_image_url: primaryImageUrl,
        image_variants: imageVariants,
        image_formats: imageFormats,
        qoh: product.qoh || 0,
        model_year: product.model_year,
        created_at: product.created_at,
        user_id: product.user_id,
      };
    });

    const response: MarketplaceProductsResponse = {
      products,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore,
      },
    };

    // Set aggressive caching headers for enterprise performance
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
        'Vary': 'Accept-Encoding',
      },
    });
  } catch (error) {
    console.error('Unexpected error in marketplace products API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

