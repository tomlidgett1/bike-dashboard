/**
 * Instant Search API - Enterprise-Grade Performance
 * 
 * GET /api/marketplace/search - Real-time search for products and stores
 * Optimizations:
 * - Minimal field selection (only what's needed)
 * - Single-pass store queries with JOIN
 * - Response caching
 * - Fast thumbnail variants
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveProductImage } from '@/lib/services/image-resolver';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    // Return empty results if query is too short
    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        products: [],
        stores: [],
      });
    }

    const supabase = await createClient();
    const searchTerm = query.trim();

    // ULTRA-FAST: Single query returns complete product data (no second fetch needed!)
    const productsQuery = supabase
      .rpc('instant_search_products', { 
        search_query: searchTerm,
        max_results: 10
      });

    // OPTIMIZED: Single query to get stores WITH product counts
    const storesQuery = supabase
      .rpc('search_stores_with_product_count', { 
        search_term: searchTerm,
        max_results: 3
      });

    // Execute both queries in parallel for maximum speed
    const queryStart = performance.now();
    const [productsResult, storesResult] = await Promise.all([
      productsQuery,
      storesQuery,
    ]);
    
    const queryTime = performance.now() - queryStart;
    console.log(`⚡ [INSTANT SEARCH] Database queries completed in ${queryTime.toFixed(2)}ms`);

    if (productsResult.error) {
      console.error('Products search error:', productsResult.error);
    }

    if (storesResult.error) {
      console.error('Stores search error:', storesResult.error);
    }

    const rawProducts = productsResult.data || [];
    const productIds = rawProducts.map((p: any) => p.product_id).filter(Boolean);
    
    const { data: readyProducts } = productIds.length > 0
      ? await supabase
          .from('marketplace_ready_products')
          .select(`
            id,
            resolved_image_id,
            resolved_external_url,
            resolved_cloudinary_url,
            resolved_cloudinary_public_id
          `)
          .in('id', productIds)
      : { data: [] as any[] };

    const readyById = new Map((readyProducts || []).map((product: any) => [product.id, product]));

    // Transform products with images from product_images table
    const products = rawProducts
      .map((product: any) => {
        const readyProduct = readyById.get(product.product_id);
        if (!readyProduct) return null;

        const resolved = resolveProductImage({
          id: readyProduct.resolved_image_id,
          cloudinary_public_id: readyProduct.resolved_cloudinary_public_id,
          cloudinary_url: readyProduct.resolved_cloudinary_url,
          external_url: readyProduct.resolved_external_url,
          approval_status: 'approved',
        });

        const imageUrl = resolved?.card_url || resolved?.original_url;
        const thumbnailUrl = resolved?.thumbnail_url;
        if (!imageUrl) return null;

        return {
          id: product.product_id,
          name: product.display_name || product.description,
          price: product.price,
          category: product.marketplace_category,
          imageUrl: thumbnailUrl || imageUrl, // Use thumbnail for search dropdown (smaller, faster)
          thumbnailUrl, // Pre-generated thumbnail for instant loading
          storeName: product.listing_type === 'private_listing' 
            ? 'Private Listing' 
            : (product.business_name || 'Unknown Store'),
          inStock: (product.qoh || 0) > 0,
          listingType: product.listing_type, // For UI to show source labels
        };
      })
      .filter(Boolean); // Remove nulls (no cloudinary image)
    
    console.log(`⚡ [SEARCH] Returned ${products.length} products with images from product_images table`);
    
    // Products are already sorted by relevance from the function

    // Transform stores data (always show stores in search results)
    const stores = (storesResult.data || [])
      .filter((store: any) => (store.product_count || 0) > 0)
      .map((store: any) => ({
        id: store.user_id,
        name: store.business_name,
        logoUrl: store.logo_url,
        productCount: store.product_count || 0,
      }));

    const totalTime = performance.now() - startTime;
    console.log(`⚡ [INSTANT SEARCH] Total response time: ${totalTime.toFixed(2)}ms - ${products.length} products, ${stores.length} stores`);

    const response = NextResponse.json({
      products,
      stores,
      query: searchTerm,
    });

    // Add cache headers for CDN/browser caching (5 seconds)
    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
    
    return response;
  } catch (error) {
    console.error('Instant search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}

