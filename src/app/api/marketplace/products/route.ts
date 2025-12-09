import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MarketplaceProduct, MarketplaceProductsResponse } from '@/lib/types/marketplace';

// ============================================================
// Marketplace Products API - Public Endpoint
// Enterprise-grade with caching, pagination, and optimization
// ============================================================

// Enable ISR caching for enterprise performance
// Revalidate every 60 seconds - balance between freshness and speed
export const revalidate = 60;

// Deploy to edge runtime for global CDN distribution (20-50ms latency globally)
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract query parameters
    const category = searchParams.get('category'); // Legacy
    const subcategory = searchParams.get('subcategory'); // Legacy
    const level1 = searchParams.get('level1'); // New 3-level taxonomy
    const level2 = searchParams.get('level2');
    const level3 = searchParams.get('level3');
    const search = searchParams.get('search');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const createdAfter = searchParams.get('createdAfter');
    const listingType = searchParams.get('listingType'); // Filter by listing type
    const condition = searchParams.get('condition'); // Filter by condition rating
    const brand = searchParams.get('brand'); // Filter by brand name
    const excludeBicycleStores = searchParams.get('excludeBicycleStores') === 'true';
    const sortBy = searchParams.get('sortBy') || 'newest';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '24');
    
    console.log(`📊 [MARKETPLACE API] Request received:`, {
      level1, level2, level3, page, pageSize, sortBy
    });

    // Create Supabase client (public access, no auth required)
    const supabase = await createClient();

    // Start building query - join with canonical products, images, and store info
    // Use estimated count for better performance on large datasets
    // For enterprise scale (10M+ users), we use estimated counts more aggressively
    const useEstimatedCount = page > 1; // Only use exact count on first page
    
    // Optimize: Use count planning hint for better performance
    const countType = useEstimatedCount ? 'planned' : 'exact';
    
    // OPTIMIZATION: Use cached image columns - eliminates expensive JOINs
    // Target: <50ms response time for category filtering
    // Only join users table for store name (small table, fast lookup)
    const fastFields = `
        id,
        canonical_product_id,
        display_name,
        description,
        price,
        marketplace_category,
        marketplace_subcategory,
        marketplace_level_3_category,
        qoh,
        created_at,
        user_id,
        listing_type,
        listing_status,
        model_year,
        condition_rating,
        cached_image_url,
        cached_thumbnail_url,
        has_displayable_image,
        images,
        users!user_id (
          business_name,
          logo_url,
          account_type
        )
      `;
    
    let query = supabase
      .from('products')
      .select(fastFields, { count: countType, head: false })
      .eq('is_active', true)
      .eq('has_displayable_image', true)  // Only products with images (uses index)
      .or('listing_status.is.null,listing_status.eq.active');

    // Apply new 3-level taxonomy filters (takes precedence)
    if (level1) {
      console.log(`🔍 [FILTER] Applying level1 filter: "${level1}"`);
      query = query.eq('marketplace_category', level1);
    } else if (category) {
      // Legacy category support
      console.log(`🔍 [FILTER] Applying legacy category filter: "${category}"`);
      query = query.eq('marketplace_category', category);
    }

    if (level2) {
      console.log(`🔍 [FILTER] Applying level2 filter: "${level2}"`);
      query = query.eq('marketplace_subcategory', level2);
    } else if (subcategory && subcategory !== 'All') {
      // Legacy subcategory support
      console.log(`🔍 [FILTER] Applying legacy subcategory filter: "${subcategory}"`);
      query = query.eq('marketplace_subcategory', subcategory);
    }

    if (level3) {
      console.log(`🔍 [FILTER] Applying level3 filter: "${level3}"`);
      query = query.eq('marketplace_level_3_category', level3);
    }

    // Apply price range filters
    if (minPrice) {
      query = query.gte('price', parseFloat(minPrice));
    }
    if (maxPrice) {
      query = query.lte('price', parseFloat(maxPrice));
    }

    // Apply date filter (created after)
    if (createdAfter) {
      query = query.gte('created_at', createdAfter);
    }

    // Apply listing type filter
    if (listingType) {
      query = query.eq('listing_type', listingType);
    }

    // Apply condition filter (for private listings with condition rating)
    if (condition) {
      query = query.eq('condition_rating', condition);
    }

    // Apply brand filter (searches in display_name - case insensitive)
    if (brand) {
      query = query.ilike('display_name', `%${brand}%`);
      console.log(`🏷️ [FILTER] Applying brand filter: "${brand}"`);
    }

    // Note: We'll filter out bicycle store products after fetching
    // because Supabase client doesn't easily support filtering on joined table columns

    // Apply enterprise-level search (multi-field fuzzy search with relevance)
    // Note: We'll handle search separately using our enterprise search function
    let searchResults: string[] | null = null;
    if (search && search.trim()) {
      // Use enterprise search function for relevance-ranked results
      const { data: searchData, error: searchError } = await supabase
        .rpc('search_marketplace_products', { 
          search_query: search.trim(),
          similarity_threshold: 0.15 // Lower threshold = more fuzzy matching
        });

      if (!searchError && searchData) {
        searchResults = searchData.map((r: any) => r.product_id);
        console.log(`🔍 [SEARCH] Found ${searchResults?.length || 0} results for "${search.trim()}"`);
        
        // If we have search results, filter by those IDs
        if (searchResults && searchResults.length > 0) {
          query = query.in('id', searchResults);
        } else {
          // No results found - return empty set
          return NextResponse.json({
            products: [],
            pagination: {
              page,
              pageSize,
              total: 0,
              totalPages: 0,
              hasMore: false,
            },
          });
        }
      } else if (searchError) {
        console.error('Search function error:', searchError);
        // Fallback to basic ILIKE search
        query = query.or(`display_name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
      }
    }

    // Apply sorting (special handling for search results)
    if (search && searchResults && searchResults.length > 0) {
      // For search results, maintain relevance order from search function
      // Note: We'll manually sort after fetching to preserve relevance
    } else {
      // Normal sorting for non-search queries
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

    // Deduplicate the data first (JOIN with product_images can create duplicates)
    const uniqueProductsMap = new Map<string, any>();
    (data || []).forEach((product: any) => {
      if (!uniqueProductsMap.has(product.id)) {
        uniqueProductsMap.set(product.id, product);
      }
    });
    let uniqueData = Array.from(uniqueProductsMap.values());

    // Exclude products from bicycle stores if requested
    if (excludeBicycleStores) {
      uniqueData = uniqueData.filter((product: any) => {
        // Check if the user's account_type is 'bicycle_store'
        const userAccountType = product.users?.account_type;
        return userAccountType !== 'bicycle_store';
      });
      console.log(`🚫 [FILTER] Excluded bicycle store products. Remaining: ${uniqueData.length}`);
    }

    // If search results exist, sort by relevance order
    if (search && searchResults && searchResults.length > 0) {
      const orderMap = new Map(searchResults.map((id, index) => [id, index]));
      uniqueData.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
      console.log(`🔍 [SEARCH] Results sorted by relevance`);
    }

    console.log(`📊 [MARKETPLACE API] Raw results: ${data?.length || 0}, Unique: ${uniqueData.length}`);

    // Calculate pagination metadata
    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;

    // Transform data to marketplace product format
    // FAST PATH: Use cached image URLs - no complex processing needed
    const products: MarketplaceProduct[] = uniqueData.map((product: any) => {
      // Use cached image URL (pre-computed by database trigger)
      const primaryImageUrl = product.cached_image_url;
      const thumbnailUrl = product.cached_thumbnail_url;
      
      // For private listings, pass through the images array for gallery
      const listingImages = product.listing_type === 'private_listing' ? product.images : null;
      
      // Build all_images array (simplified - detail page fetches full gallery)
      const allImages: string[] = primaryImageUrl ? [primaryImageUrl] : [];
      if (listingImages && Array.isArray(listingImages)) {
        listingImages.forEach((img: any) => {
          if (img.url && !allImages.includes(img.url)) {
            allImages.push(img.url);
          }
        });
      }
      
      return {
        id: product.id,
        canonical_product_id: product.canonical_product_id,
        description: product.description,
        display_name: product.display_name,
        price: parseFloat(product.price) || 0,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        primary_image_url: primaryImageUrl,
        image_variants: null, // Only needed on detail page
        all_images: allImages,
        images: listingImages,
        // Use cached thumbnail for optimised loading
        card_url: primaryImageUrl,
        thumbnail_url: thumbnailUrl,
        detail_url: primaryImageUrl, // Detail page will fetch full resolution
        qoh: product.qoh || 0,
        model_year: product.model_year,
        created_at: product.created_at,
        user_id: product.user_id,
        store_name: product.users?.business_name || 'Bike Store',
        store_logo_url: product.users?.logo_url || null,
        listing_type: product.listing_type,
        listing_status: product.listing_status,
        condition_rating: product.condition_rating || null,
      } as MarketplaceProduct;
    });
    
    console.log(`⚡ [FAST QUERY] Returned ${products.length} products with cached images`);

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

    const totalTime = Date.now() - startTime;
    console.log(`✅ [MARKETPLACE API] Request completed in ${totalTime}ms`, {
      productsReturned: products.length,
      total,
      hasMore
    });

    // Set aggressive caching headers for enterprise performance
    // Cache filtered results for 5 minutes, allow stale content while revalidating
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
        'Vary': 'Accept-Encoding',
        'X-Response-Time': `${totalTime}ms`, // Track performance
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

