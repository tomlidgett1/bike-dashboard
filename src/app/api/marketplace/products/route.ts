import { NextRequest, NextResponse } from 'next/server';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import type { MarketplaceProduct, MarketplaceProductsResponse } from '@/lib/types/marketplace';
import { resolveProductImage } from '@/lib/services/image-resolver';
import { toCurrentHeroPublicId } from '@/lib/utils/cloudinary-transforms';
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed';

// ============================================================
// Marketplace Products API - Public Endpoint
// Enterprise-grade with caching, pagination, and optimization
// ============================================================

// Short public freshness budget: marketplace listings must disappear quickly
// after an owner deactivates or removes them.
export const revalidate = 15;

// Deploy to edge runtime for global CDN distribution (20-50ms latency globally)
export const runtime = 'edge';

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function getSpaceForCount(listingType: string | null, uberOnly: boolean) {
  if (uberOnly) return 'uber';
  if (listingType === 'store_inventory') return 'stores';
  if (listingType === 'private_listing') return 'marketplace';
  return null;
}

async function getPrecomputedSpaceTotal(
  supabase: ReturnType<typeof createPublicSupabaseClient>,
  space: string | null,
) {
  if (!space) return null;

  const { data, error } = await supabase
    .from('public_marketplace_space_counts')
    .select('total')
    .eq('space', space)
    .maybeSingle();

  if (hasMissingPublicCardFeedError(error)) return null;
  if (error) {
    console.warn('[MARKETPLACE API] Space count lookup failed:', error.message);
    return null;
  }

  const total = data?.total;
  return typeof total === 'number' ? total : Number(total ?? 0);
}

function estimatedTotalFromPage(page: number, pageSize: number, returned: number, hasMore: boolean) {
  return (page - 1) * pageSize + returned + (hasMore ? 1 : 0);
}

async function tryGetProductsFromPublicCards(
  request: NextRequest,
  startTime: number,
): Promise<NextResponse | null> {
  const searchParams = request.nextUrl.searchParams;

  const category = searchParams.get('category');
  const subcategory = searchParams.get('subcategory');
  const level1 = searchParams.get('level1');
  const level2 = searchParams.get('level2');
  const level3 = searchParams.get('level3');
  const search = searchParams.get('search');
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  const createdAfter = searchParams.get('createdAfter');
  const listingType = searchParams.get('listingType');
  const lsCategory = searchParams.get('lsCategory');
  const condition = searchParams.get('condition');
  const brand = searchParams.get('brand');
  const uberOnly = searchParams.get('uberOnly') === 'true';
  const excludeBicycleStores = searchParams.get('excludeBicycleStores') === 'true';
  const sortBy = searchParams.get('sortBy') || 'newest';
  const page = parsePositiveInt(searchParams.get('page'), 1, 10_000);
  const pageSize = parsePositiveInt(searchParams.get('pageSize'), 24, 60);
  const storeId = searchParams.get('storeId');
  const cursorCreatedAt = searchParams.get('cursorCreatedAt');
  const cursorId = searchParams.get('cursorId');
  const canUseCursor = sortBy === 'newest' && !search && !!cursorCreatedAt && !!cursorId;

  // The public card feed is a materialized view and can briefly lag behind
  // marketplace_ready_products after image approvals or view changes. For
  // explicit searches and store-specific browsing, correctness is more important
  // than using the feed cache: otherwise intersecting ranked search IDs or
  // selecting a store can collapse a full result set down to stale cards.
  if (search?.trim() || storeId) {
    return null;
  }

  const supabase = createPublicSupabaseClient();

  try {
    let query = supabase
      .from('public_marketplace_cards')
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .not('resolved_image_id', 'is', null)
      .or('listing_status.is.null,listing_status.eq.active');

    const isStoreFeed = listingType === 'store_inventory' || uberOnly;

    if (isStoreFeed) {
      query = query
        .eq('listing_type', 'store_inventory')
        .eq('is_verified_bike_store', true);
    } else if (listingType === 'private_listing') {
      query = query.eq('listing_type', 'private_listing');
    } else if (listingType) {
      query = query.eq('listing_type', listingType);
    }

    if (uberOnly) {
      query = query.eq('uber_delivery_enabled', true);
    }

    if (storeId) {
      query = query.eq('user_id', storeId);
    }

    if (lsCategory) {
      query = query.eq('category_name', lsCategory);
    } else if (!isStoreFeed && level1) {
      query = query.eq('marketplace_category', level1);
    } else if (!isStoreFeed && category) {
      query = query.eq('marketplace_category', category);
    }

    if (!isStoreFeed && level2) {
      query = query.eq('marketplace_subcategory', level2);
    } else if (!isStoreFeed && subcategory && subcategory !== 'All') {
      query = query.eq('marketplace_subcategory', subcategory);
    }

    if (!isStoreFeed && level3) {
      query = query.eq('marketplace_level_3_category', level3);
    }

    if (minPrice) query = query.gte('price', Number.parseFloat(minPrice));
    if (maxPrice) query = query.lte('price', Number.parseFloat(maxPrice));
    if (createdAfter) query = query.gte('created_at', createdAfter);
    if (condition) query = query.eq('condition_rating', condition);
    if (brand) query = query.ilike('brand', `%${brand}%`);
    if (excludeBicycleStores) {
      query = query.or('store_account_type.is.null,store_account_type.neq.bicycle_store');
    }

    switch (sortBy) {
      case 'price_asc':
        query = query.order('price', { ascending: true }).order('id', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false }).order('id', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true }).order('id', { ascending: true });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
        break;
    }

    if (canUseCursor) {
      query = query
        .or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
        .limit(pageSize + 1);
    } else {
      const from = (page - 1) * pageSize;
      query = query.range(from, from + pageSize);
    }

    const { data, error } = await query;

    if (hasMissingPublicCardFeedError(error)) return null;
    if (error) {
      console.warn('[MARKETPLACE API] Public-card fast path failed, falling back:', error.message);
      return null;
    }

    const rows = ((data || []) as PublicMarketplaceCardRow[]);

    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const products = pageRows.map(transformPublicMarketplaceCard);
    const last = products[products.length - 1];

    const hasOnlySpaceFilters =
      !search &&
      !minPrice &&
      !maxPrice &&
      !createdAfter &&
      !condition &&
      !brand &&
      !storeId &&
      !level1 &&
      !level2 &&
      !level3 &&
      !lsCategory &&
      !category &&
      !subcategory &&
      !excludeBicycleStores;

    const precomputedTotal = hasOnlySpaceFilters
      ? await getPrecomputedSpaceTotal(supabase, getSpaceForCount(listingType, uberOnly))
      : null;
    const total = precomputedTotal ?? estimatedTotalFromPage(page, pageSize, products.length, hasMore);
    const totalPages = Math.ceil(total / pageSize);
    const totalTime = Date.now() - startTime;

    const response: MarketplaceProductsResponse = {
      products,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore,
        nextCursor: last
          ? {
              createdAt: last.created_at,
              id: last.id,
            }
          : null,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15',
        'CDN-Cache-Control': 'public, s-maxage=15',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=15',
        'Vary': 'Accept-Encoding',
        'X-Response-Time': `${totalTime}ms`,
        'X-Marketplace-Feed': 'public-cards',
      },
    });
  } catch (error) {
    console.warn('[MARKETPLACE API] Public-card fast path exception, falling back:', error);
    return null;
  }
}

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
    const lsCategory = searchParams.get('lsCategory'); // Filter store inventory by Lightspeed category_name
    const condition = searchParams.get('condition'); // Filter by condition rating
    const brand = searchParams.get('brand'); // Filter by brand name
    const uberOnly = searchParams.get('uberOnly') === 'true';
    const excludeBicycleStores = searchParams.get('excludeBicycleStores') === 'true';
    const sortBy = searchParams.get('sortBy') || 'newest';
    const page = parsePositiveInt(searchParams.get('page'), 1, 10_000);
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 24, 60);
    const storeId = searchParams.get('storeId');

    const publicCardResponse = await tryGetProductsFromPublicCards(request, startTime);
    if (publicCardResponse) return publicCardResponse;
    
    console.log(`📊 [MARKETPLACE API] Request received:`, {
      level1, level2, level3, page, pageSize, sortBy
    });

    // Create Supabase client (public access, no auth required)
    const supabase = await createClient();

    const useEstimatedCount = page > 1; // Only use exact count on first page
    const countType = useEstimatedCount ? 'estimated' : 'exact';

    const fastFields = `
        id,
        canonical_product_id,
        resolved_image_id,
        resolved_image_source,
        resolved_external_url,
        resolved_cloudinary_url,
        resolved_cloudinary_public_id,
        display_name,
        description,
        price,
        discount_percent,
        discount_active,
        discount_ends_at,
        sale_price,
        marketplace_category,
        marketplace_subcategory,
        marketplace_level_3_category,
        category_name,
        qoh,
        created_at,
        user_id,
        brand,
        manufacturer_name,
        listing_type,
        listing_source,
        listing_status,
        uber_delivery_enabled,
        model_year,
        condition_rating,
        pickup_location
      `;
    
    let query = supabase
      .from('marketplace_ready_products')
      .select(fastFields, { count: countType, head: false })
      .not('resolved_image_id', 'is', null)
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

    // Lightspeed category filter (store inventory tab)
    if (lsCategory) {
      query = query.eq('category_name', lsCategory);
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

    if (uberOnly) {
      query = query.eq('uber_delivery_enabled', true);
    }

    // Apply listing type filter
    const requiresVerifiedStoreProducts = listingType === 'store_inventory' || uberOnly;
    if (requiresVerifiedStoreProducts) {
      // Shop inventory is identified by verified seller, not only listing_type
      // (Lightspeed sync historically left listing_type NULL).
      const { data: storeUsers, error: storeUsersError } = await supabase
        .from('users')
        .select('user_id')
        .eq('account_type', 'bicycle_store')
        .eq('bicycle_store', true);

      if (storeUsersError) {
        console.error('Bike store user lookup error:', storeUsersError);
        return NextResponse.json(
          { error: 'Failed to fetch products' },
          { status: 500 }
        );
      }

      const storeUserIds = (storeUsers ?? []).map((u: { user_id: string }) => u.user_id);
      if (storeUserIds.length === 0) {
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

      query = query
        .in('user_id', storeUserIds)
        .or('listing_type.eq.store_inventory,listing_type.is.null');
      console.log(`🏪 [FILTER] Bike stores: ${storeUserIds.length} verified sellers`, {
        uberOnly,
      });
    } else if (listingType) {
      query = query.eq('listing_type', listingType);
    }

    // Apply store filter (filter products by specific store/user)
    if (storeId) {
      query = query.eq('user_id', storeId);
      console.log(`🏪 [FILTER] Applying store filter: "${storeId}"`);
    }

    // Apply condition filter (for private listings with condition rating)
    if (condition) {
      query = query.eq('condition_rating', condition);
    }

    // Apply brand filter. Lightspeed inventory stores the brand in
    // manufacturer_name; manual/private listings use brand.
    if (brand) {
      query = query.or(`brand.ilike.${brand},manufacturer_name.ilike.${brand}`);
      console.log(`🏷️ [FILTER] Applying brand filter: "${brand}"`);
    }

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

    // Execute query. Image readiness is already filtered in marketplace_ready_products.
    const { data, error, count } = await query;

    if (error) {
      console.error('Marketplace products query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    let uniqueData = data || [];

    const userIds = [...new Set(uniqueData.map((product: any) => product.user_id).filter(Boolean))];
    const { data: usersData } = userIds.length > 0
      ? await supabase
          .from('users')
          .select('user_id, business_name, logo_url, account_type, bicycle_store, first_name, last_name')
          .in('user_id', userIds)
      : { data: [] as any[] };

    const usersById = new Map((usersData || []).map((user: any) => [user.user_id, user]));

    // Exclude products from bicycle stores if requested
    if (excludeBicycleStores) {
      uniqueData = uniqueData.filter((product: any) => {
        const userAccountType = usersById.get(product.user_id)?.account_type;
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

    console.log(`📊 [MARKETPLACE API] Ready products: ${uniqueData.length}`);

    // Calculate pagination metadata
    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;

    // Transform data to marketplace product format
    const products: MarketplaceProduct[] = uniqueData.map((product: any) => {
      const user = usersById.get(product.user_id);

      // Normalise hero PIDs to the current HERO_NORMALIZE_TRANSFORM so every
      // card renders at the same product height regardless of approval era.
      const effectivePublicId = toCurrentHeroPublicId(
        product.resolved_cloudinary_public_id,
        product.resolved_image_source
      );

      const resolved = resolveProductImage({
        id: product.resolved_image_id,
        cloudinary_public_id: effectivePublicId,
        cloudinary_url: product.resolved_cloudinary_url,
        external_url: product.resolved_external_url,
        approval_status: 'approved',
      });

      const primaryImageUrl = resolved?.card_url || resolved?.original_url || null;
      const thumbnailUrl = resolved?.thumbnail_url || primaryImageUrl;
      const allImages = [resolved?.gallery_url, resolved?.detail_url, primaryImageUrl]
        .filter((url): url is string => !!url)
        .filter((url, index, arr) => arr.indexOf(url) === index);
      
      return {
        id: product.id,
        canonical_product_id: product.canonical_product_id,
        description: product.description,
        display_name: product.display_name,
        price: parseFloat(product.price) || 0,
        discount_percent: product.discount_percent != null ? parseFloat(product.discount_percent) : null,
        discount_active: product.discount_active ?? false,
        discount_ends_at: product.discount_ends_at ?? null,
        sale_price: product.sale_price != null ? parseFloat(product.sale_price) : null,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        primary_image_url: primaryImageUrl,
        image_variants: null, // Only needed on detail page
        all_images: allImages,
        images: [],
        cloudinary_public_id: effectivePublicId,
        card_url: primaryImageUrl,
        mobile_card_url: resolved?.mobile_card_url || primaryImageUrl,
        thumbnail_url: thumbnailUrl,
        detail_url: resolved?.detail_url || resolved?.gallery_url || primaryImageUrl,
        qoh: product.qoh || 0,
        model_year: product.model_year,
        created_at: product.created_at,
        user_id: product.user_id,
        store_name: user?.business_name || 'Bike Store',
        store_logo_url: user?.logo_url || null,
        store_account_type: user?.account_type || null,
        store_bicycle_store: user?.bicycle_store ?? null,
        first_name: user?.first_name || null,
        last_name: user?.last_name || null,
        brand: product.brand || product.manufacturer_name || null,
        listing_type: product.listing_type,
        listing_source: product.listing_source,
        listing_status: product.listing_status,
        uber_delivery_enabled: product.uber_delivery_enabled ?? false,
        condition_rating: product.condition_rating || null,
        pickup_location: product.pickup_location || null,
      } as MarketplaceProduct;
    });

    console.log(`⚡ [READY PRODUCTS] Returned ${products.length} products with resolved images`);

    const response: MarketplaceProductsResponse = {
      products,
      pagination: {
        page,
        pageSize,
        total, // Keep original total from database query
        totalPages, // Keep original totalPages from database query
        hasMore, // Keep original hasMore from database query
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
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15',
        'CDN-Cache-Control': 'public, s-maxage=15',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=15',
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
