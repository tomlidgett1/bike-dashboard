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

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // OPTIMIZED: Products already come with complete data from single query
    // No need for separate image fetching or joins
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    // We need to fetch canonical images separately for now (only for products that need them)
    const productsWithCanonicalIds = (productsResult.data || [])
      .filter((p: any) => !p.use_custom_image && !p.primary_image_url && p.canonical_product_id)
      .map((p: any) => p.canonical_product_id);

    let canonicalImagesMap = new Map();
    if (productsWithCanonicalIds.length > 0) {
      const { data: canonicalImages } = await supabase
        .from('product_images')
        .select('canonical_product_id, storage_path, is_primary, variants')
        .in('canonical_product_id', productsWithCanonicalIds)
        .eq('is_primary', true);
      
      canonicalImages?.forEach((img: any) => {
        canonicalImagesMap.set(img.canonical_product_id, img);
      });
    }

    const products = (productsResult.data || [])
      .map((product: any) => {
        let imageUrl = null;
        
        // Priority 1: Custom store image
        if (product.use_custom_image && product.custom_image_url) {
          imageUrl = product.custom_image_url;
        } 
        // Priority 2: Canonical product images
        else if (product.canonical_product_id) {
          const primaryImage = canonicalImagesMap.get(product.canonical_product_id);
          if (primaryImage) {
            // Use thumbnail for instant search speed
            if (primaryImage.variants?.thumbnail) {
              imageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.variants.thumbnail}`;
            } else if (primaryImage.variants?.small) {
              imageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.variants.small}`;
            } else if (primaryImage.storage_path) {
              imageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.storage_path}`;
            }
          }
        }
        // Priority 3: Direct image URLs
        else if (product.primary_image_url) {
          imageUrl = product.primary_image_url;
        }

        // Skip products without images
        if (!imageUrl) return null;

        return {
          id: product.product_id,
          name: product.display_name || product.description,
          price: product.price,
          category: product.marketplace_category,
          imageUrl,
          storeName: product.business_name || 'Unknown Store',
          inStock: (product.qoh || 0) > 0,
        };
      })
      .filter(Boolean); // Remove nulls
    
    // Products are already sorted by relevance from the function

    // Transform stores data (already includes product counts from optimized query)
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

