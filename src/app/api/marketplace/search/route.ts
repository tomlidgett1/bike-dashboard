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

    // ============================================================
    // REFACTORED: Fetch images from product_images table (source of truth)
    // Batch-fetch primary images for all search results
    // ============================================================
    const rawProducts = productsResult.data || [];
    
    // Collect all product IDs and canonical IDs for image lookup
    const allProductIds = rawProducts.map((p: any) => p.product_id).filter(Boolean);
    const allCanonicalIds = rawProducts
      .filter((p: any) => p.canonical_product_id)
      .map((p: any) => p.canonical_product_id);
    
    // Batch-fetch primary images from product_images table (NEW source of truth)
    let productImagesMap = new Map<string, any>();
    let canonicalImagesMap = new Map<string, any>();
    
    // Query by product_id
    if (allProductIds.length > 0) {
      const { data: productImagesData } = await supabase
        .from('product_images')
        .select('product_id, canonical_product_id, thumbnail_url, card_url, cloudinary_url, is_primary')
        .in('product_id', allProductIds)
        .eq('approval_status', 'approved')
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true });
      
      if (productImagesData) {
        for (const img of productImagesData) {
          if (img.product_id && !productImagesMap.has(img.product_id)) {
            productImagesMap.set(img.product_id, img);
          }
        }
      }
    }
    
    // Query by canonical_product_id (for products without direct product_id images)
    if (allCanonicalIds.length > 0) {
      const { data: canonicalImagesData } = await supabase
        .from('product_images')
        .select('product_id, canonical_product_id, thumbnail_url, card_url, cloudinary_url, is_primary')
        .in('canonical_product_id', allCanonicalIds)
        .eq('approval_status', 'approved')
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true });
      
      if (canonicalImagesData) {
        for (const img of canonicalImagesData) {
          if (img.canonical_product_id && !canonicalImagesMap.has(img.canonical_product_id)) {
            canonicalImagesMap.set(img.canonical_product_id, img);
          }
        }
      }
    }
    
    console.log(`🖼️ [SEARCH] Fetched ${productImagesMap.size} product images, ${canonicalImagesMap.size} canonical images`);

    // Transform products with images from product_images table
    const products = rawProducts
      .map((product: any) => {
        // Look up image from product_images table (NEW source of truth)
        const productImage = productImagesMap.get(product.product_id);
        const canonicalImage = product.canonical_product_id 
          ? canonicalImagesMap.get(product.canonical_product_id) 
          : null;
        
        const imageFromTable = productImage || canonicalImage;
        
        let imageUrl = null;
        let thumbnailUrl = null;
        let hasCloudinaryImage = false;
        
        // Priority 1: Images from product_images table (NEW source of truth)
        if (imageFromTable?.cloudinary_url || imageFromTable?.card_url) {
          hasCloudinaryImage = true;
          thumbnailUrl = imageFromTable.thumbnail_url || null;
          imageUrl = imageFromTable.card_url || imageFromTable.cloudinary_url;
        }
        // Priority 2: Fallback to cached columns during transition
        else if (product.cached_image_url && product.cached_image_url.includes('cloudinary')) {
          hasCloudinaryImage = true;
          imageUrl = product.cached_image_url;
          thumbnailUrl = product.cached_thumbnail_url || null;
        }
        // Priority 3: Custom store image fallback
        else if (product.use_custom_image && product.custom_image_url?.includes('cloudinary')) {
          hasCloudinaryImage = true;
          imageUrl = product.custom_image_url;
        }

        // Skip products without cloudinary images
        if (!hasCloudinaryImage || !imageUrl) return null;

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

