/**
 * Trending Products API - OPTIMISED
 * 
 * Returns products with high trending scores (what's hot right now)
 * Uses single RPC query instead of 2 sequential queries
 * Expected: 3.00s → ~200ms
 * 
 * GET /api/marketplace/trending
 * Query params:
 *   - limit: number of products (default: 50)
 *   - category: filter by marketplace_category
 *   - listingType: filter by listing_type
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveProductImage } from '@/lib/services/image-resolver';

// Enable ISR caching - trending updates every 15 minutes
export const revalidate = 900; // 15 minutes

// Deploy to edge runtime for global CDN distribution
export const runtime = 'edge';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const READY_PRODUCT_FIELDS = `
  id,
  description,
  display_name,
  price,
  marketplace_category,
  marketplace_subcategory,
  created_at,
  user_id,
  listing_type,
  resolved_image_id,
  resolved_external_url,
  resolved_cloudinary_url,
  resolved_cloudinary_public_id
`;

// Helper function to transform a ready-view product to API response format
function transformProduct(product: any) {
  const resolved = resolveProductImage({
    id: product.resolved_image_id,
    cloudinary_public_id: product.resolved_cloudinary_public_id,
    cloudinary_url: product.resolved_cloudinary_url,
    external_url: product.resolved_external_url,
    approval_status: 'approved',
  });
  const primaryUrl = resolved?.card_url || resolved?.original_url || null;
  const allImages = [resolved?.gallery_url, resolved?.detail_url, primaryUrl]
    .filter((url): url is string => !!url)
    .filter((url, index, arr) => arr.indexOf(url) === index);

  return {
    id: product.id,
    description: product.description,
    display_name: product.display_name,
    price: parseFloat(product.price) || 0,
    marketplace_category: product.marketplace_category,
    marketplace_subcategory: product.marketplace_subcategory,
    primary_image_url: primaryUrl,
    card_url: primaryUrl,
    thumbnail_url: resolved?.thumbnail_url || primaryUrl,
    detail_url: resolved?.detail_url || resolved?.gallery_url || primaryUrl,
    all_images: allImages,
    user_id: product.user_id,
    store_name: product.store_name || 'Unknown Store',
    store_logo_url: product.store_logo_url || null,
    listing_type: product.listing_type,
    images: null,
    created_at: product.created_at,
  };
}

// Helper function to fetch fallback products (newest with Cloudinary images)
async function getFallbackProducts(
  supabase: any,
  limit: number,
  category: string | null,
  listingType: string | null
): Promise<any[]> {
  console.log('[TRENDING] No trending products found, fetching newest products as fallback');
  
  let query = supabase
    .from('marketplace_ready_products')
    .select(READY_PRODUCT_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (category) {
    query = query.eq('marketplace_category', category);
  }
  
  if (listingType) {
    query = query.eq('listing_type', listingType);
  }
  
  const { data: products, error } = await query;
  
  if (error || !products) {
    console.error('[TRENDING] Fallback query error:', error);
    return [];
  }
  
  const result = products.map(transformProduct).filter((product: any) => product.primary_image_url);
  
  console.log(`[TRENDING] Fallback returned ${result.length} newest products with Cloudinary images`);
  return result;
}

export async function GET(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT)),
      MAX_LIMIT
    );
    const category = searchParams.get('category') || null;
    const listingType = searchParams.get('listingType') || null;

    const supabase = await createClient();

    // OPTIMISED: Single RPC query instead of 2 sequential queries
    const { data: products, error: rpcError } = await supabase
      .rpc('get_trending_products', {
        p_limit: limit,
        p_category: category,
        p_listing_type: listingType
      });

    if (!rpcError && products) {
      const productIds = (products || []).map((product: any) => product.id || product.product_id).filter(Boolean);
      const { data: readyProducts } = productIds.length > 0
        ? await supabase
            .from('marketplace_ready_products')
            .select(READY_PRODUCT_FIELDS)
            .in('id', productIds)
        : { data: [] as any[] };

      const readyById = new Map((readyProducts || []).map((product: any) => [product.id, product]));
      const enriched = productIds
        .map((id: string) => readyById.get(id))
        .filter(Boolean)
        .map(transformProduct)
        .filter((product: any) => product.primary_image_url);
      
      console.log(`🖼️ [TRENDING] Filtered to ${enriched.length} products with Cloudinary images`);

      // FALLBACK: If no trending products with Cloudinary images, fetch newest products
      let finalProducts = enriched;
      let usedFallback = false;
      
      if (enriched.length === 0) {
        finalProducts = await getFallbackProducts(supabase, limit, category, listingType);
        usedFallback = true;
      }

      const queryTime = performance.now() - startTime;
      console.log(`⚡ [TRENDING] Fetched ${finalProducts.length} products in ${queryTime.toFixed(0)}ms (RPC${usedFallback ? ' + fallback' : ''})`);

      return NextResponse.json({
        success: true,
        products: finalProducts,
        pagination: {
          page: 1,
          limit,
          total: finalProducts.length,
          hasMore: false,
        },
        meta: {
          view_mode: 'trending',
          category_filter: category,
          response_time_ms: queryTime.toFixed(0),
          used_fallback: usedFallback,
        },
      });
    }

    // Fallback: RPC not available, use original 2-query approach
    console.log('[TRENDING] RPC not available, using fallback queries');
    
    // Get product IDs from product_scores WHERE trending_score > 0
    const { data: scores, error: scoresError } = await supabase
      .from('product_scores')
      .select('product_id, trending_score')
      .gt('trending_score', 0)
      .order('trending_score', { ascending: false })
      .limit(limit);

    if (scoresError) {
      console.error('[Trending API] Error:', scoresError);
      return NextResponse.json(
        { error: 'Failed to fetch trending scores', details: scoresError.message },
        { status: 500 }
      );
    }

    if (!scores || scores.length === 0) {
      // FALLBACK: No trending scores exist, return newest products
      const fallbackProducts = await getFallbackProducts(supabase, limit, category, listingType);
      const queryTime = performance.now() - startTime;
      
      return NextResponse.json({
        success: true,
        products: fallbackProducts,
        pagination: { page: 1, limit, total: fallbackProducts.length, hasMore: false },
        meta: { 
          view_mode: 'trending', 
          category_filter: category,
          response_time_ms: queryTime.toFixed(0),
          used_fallback: true,
        },
      });
    }

    const productIds = scores.map(s => s.product_id);

    // Get full product data
    let productsQuery = supabase
      .from('marketplace_ready_products')
      .select(READY_PRODUCT_FIELDS)
      .in('id', productIds);

    if (category) {
      productsQuery = productsQuery.eq('marketplace_category', category);
    }

    if (listingType) {
      productsQuery = productsQuery.eq('listing_type', listingType);
    }

    const { data: fallbackProducts, error: productsError } = await productsQuery;

    if (productsError) {
      console.error('[Trending API] Products error:', productsError);
      return NextResponse.json(
        { error: 'Failed to fetch products', details: productsError.message },
        { status: 500 }
      );
    }

    const enriched = (fallbackProducts || [])
      .map(transformProduct)
      .filter((product: any) => product.primary_image_url);

    // Maintain trending order
    const productMap = new Map(enriched.map((p: any) => [p.id, p]));
    let ordered = productIds.map(id => productMap.get(id)).filter(Boolean);
    let usedFallback = false;

    // FALLBACK: If no trending products with Cloudinary images, fetch newest products
    if (ordered.length === 0) {
      ordered = await getFallbackProducts(supabase, limit, category, listingType);
      usedFallback = true;
    }

    const queryTime = performance.now() - startTime;
    console.log(`⚡ [TRENDING] Fetched ${ordered.length} products in ${queryTime.toFixed(0)}ms (2-query${usedFallback ? ' + fallback' : ''})`);

    return NextResponse.json({
      success: true,
      products: ordered,
      pagination: {
        page: 1,
        limit,
        total: ordered.length,
        hasMore: false,
      },
      meta: {
        view_mode: 'trending',
        category_filter: category,
        response_time_ms: queryTime.toFixed(0),
        used_fallback: usedFallback,
      },
    });

  } catch (error) {
    console.error('[Trending API] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

