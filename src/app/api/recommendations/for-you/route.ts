/**
 * For You Recommendations API
 * 
 * Returns personalized product recommendations with caching and fallback logic.
 * 
 * GET /api/recommendations/for-you
 * Query params:
 *   - limit: number of recommendations (default: 50)
 *   - refresh: force refresh cache (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateHybridRecommendations } from '@/lib/recommendations/algorithms';

// ============================================================
// Cache Configuration
// ============================================================

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_RECOMMENDATIONS = 100;
const DEFAULT_LIMIT = 50;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get cached recommendations from database
 */
async function getCachedRecommendations(
  supabase: any,
  userId: string | null
): Promise<string[] | null> {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('recommendation_cache')
      .select('recommended_products, expires_at, recommendation_type')
      .eq('user_id', userId)
      .eq('recommendation_type', 'personalized')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data.recommended_products;
  } catch (error) {
    console.error('[Recommendations API] Cache lookup error:', error);
    return null;
  }
}

/**
 * Save recommendations to cache
 */
async function cacheRecommendations(
  supabase: any,
  userId: string | null,
  productIds: string[],
  recommendationType: string = 'personalized'
): Promise<void> {
  if (!userId) return;

  try {
    const expiresAt = new Date(Date.now() + CACHE_DURATION);

    await supabase
      .from('recommendation_cache')
      .insert({
        user_id: userId,
        recommended_products: productIds,
        recommendation_type: recommendationType,
        score: 1.0,
        algorithm_version: 'v1.0',
        expires_at: expiresAt.toISOString(),
      });
  } catch (error) {
    console.error('[Recommendations API] Cache save error:', error);
    // Don't throw - caching is not critical
  }
}

/**
 * Get fallback recommendations for anonymous users
 */
async function getAnonymousRecommendations(
  supabase: any,
  limit: number
): Promise<string[]> {
  try {
    // Use the getTrendingProducts algorithm instead
    const { getTrendingProducts } = await import('@/lib/recommendations/algorithms');
    const result = await getTrendingProducts(supabase, { limit });
    return result.productIds;
  } catch (error) {
    console.error('[Recommendations API] Anonymous fallback exception:', error);
    return [];
  }
}

/**
 * Enrich product IDs with full product data
 */
async function enrichProducts(
  supabase: any,
  productIds: string[]
): Promise<any[]> {
  if (productIds.length === 0) {
    console.log('[enrichProducts] No product IDs to enrich');
    return [];
  }

  console.log('[enrichProducts] Enriching', productIds.length, 'products...');

  try {
    // Get products with canonical images (same as trending API)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        *,
        users!user_id (
          business_name,
          logo_url
        ),
        canonical_products!canonical_product_id (
          id,
          product_images!canonical_product_id (
            storage_path,
            is_primary,
            variants
          )
        )
      `)
      .in('id', productIds)
      .eq('is_active', true);

    if (productsError) {
      console.error('[enrichProducts] Products query error:', productsError);
      return [];
    }

    console.log('[enrichProducts] Got', products?.length || 0, 'products from DB');

    if (!products || products.length === 0) {
      console.warn('[enrichProducts] No products found for IDs:', productIds.slice(0, 3));
      return [];
    }

    // Get product scores separately
    const { data: scores } = await supabase
      .from('product_scores')
      .select('*')
      .in('product_id', productIds);

    const scoreMap = new Map(scores?.map((s: any) => [s.product_id, s]) || []);

    // Transform to marketplace format (EXACT same logic as /api/marketplace/products)
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    const enriched = products.map((product: any) => {
      const score = scoreMap.get(product.id);
      let primaryImageUrl = null;
      let imageVariants = null;
      let allImages: string[] = [];
      
      // Priority 1: Custom store image
      if (product.use_custom_image && product.custom_image_url) {
        primaryImageUrl = product.custom_image_url;
        allImages.push(product.custom_image_url);
      }
      // Priority 2: Canonical product images
      else if (product.canonical_products?.product_images) {
        const images = product.canonical_products.product_images;
        
        // Get primary image
        const primaryImage = images.find((img: any) => img.is_primary);
        if (primaryImage) {
          primaryImageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.storage_path}`;
          imageVariants = primaryImage.variants;
        }
        
        // Get ALL images for gallery (primary first)
        const sortedImages = [...images].sort((a: any, b: any) => {
          if (a.is_primary) return -1;
          if (b.is_primary) return 1;
          return 0;
        });
        
        allImages = sortedImages
          .map((img: any) => {
            if (img.variants?.large) {
              return `${baseUrl}/storage/v1/object/public/product-images/${img.variants.large}`;
            }
            return `${baseUrl}/storage/v1/object/public/product-images/${img.storage_path}`;
          })
          .filter(Boolean);
      }
      
      // Priority 3: Placeholder if no image
      if (!primaryImageUrl) {
        primaryImageUrl = '/placeholder-product.svg';
        allImages = ['/placeholder-product.svg'];
      }
    
      return {
        id: product.id,
        description: product.description,
        display_name: product.display_name,
        price: parseFloat(product.price) || 0,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        primary_image_url: primaryImageUrl,
        image_variants: imageVariants,
        all_images: allImages,
        user_id: product.user_id,
        store_name: product.users?.business_name || 'Unknown Store',
        store_logo_url: product.users?.logo_url || null,
        listing_type: product.listing_type,
        images: product.images, // Keep original images array for private listings
        product_scores: score || null,
      };
    });

    console.log('[enrichProducts] Enriched', enriched.length, 'products');

    // Maintain the original order
    const productMap = new Map(enriched.map((p: any) => [p.id, p]));
    const ordered = productIds.map(id => productMap.get(id)).filter(Boolean);
    
    console.log('[enrichProducts] Returning', ordered.length, 'products in order');
    
    return ordered;
  } catch (error) {
    console.error('[enrichProducts] Exception:', error);
    console.error('[enrichProducts] Error details:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

// ============================================================
// GET Handler
// ============================================================

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT)),
      MAX_RECOMMENDATIONS
    );
    const forceRefresh = searchParams.get('refresh') === 'true';
    const enrichData = searchParams.get('enrich') !== 'false'; // Default: true

    // Initialize Supabase client
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    let productIds: string[] = [];
    let cacheHit = false;

    // Try cache first (if authenticated and not forcing refresh)
    if (userId && !forceRefresh) {
      const cached = await getCachedRecommendations(supabase, userId);
      if (cached && cached.length > 0) {
        productIds = cached.slice(0, limit);
        cacheHit = true;
      }
    }

    // Generate recommendations if cache miss
    if (productIds.length === 0) {
      console.log('[Recommendations API] Cache miss, generating fresh recommendations...');
      
      if (userId) {
        // Personalized recommendations
        console.log('[Recommendations API] Generating personalized for user:', userId);
        productIds = await generateHybridRecommendations(supabase, userId, {
          limit,
          diversityFactor: 0.2,
        });
        console.log('[Recommendations API] Generated', productIds.length, 'personalized recommendations');

        // Cache the results
        if (productIds.length > 0) {
          await cacheRecommendations(supabase, userId, productIds, 'personalized');
          console.log('[Recommendations API] Cached recommendations');
        }
      } else {
        // Anonymous recommendations (trending)
        console.log('[Recommendations API] Generating anonymous trending recommendations');
        productIds = await getAnonymousRecommendations(supabase, limit);
        console.log('[Recommendations API] Generated', productIds.length, 'anonymous recommendations');
      }
    } else {
      console.log('[Recommendations API] Using cached recommendations:', productIds.length);
    }

    // Fallback to trending if no recommendations
    if (productIds.length === 0) {
      console.log('[Recommendations API] No recommendations found, using fallback...');
      productIds = await getAnonymousRecommendations(supabase, limit);
      console.log('[Recommendations API] Fallback returned', productIds.length, 'products');
    }

    console.log('[Recommendations API] Total product IDs:', productIds.length);

    // Enrich with product data if requested
    let products: any[] = [];
    if (enrichData) {
      console.log('[Recommendations API] Enriching', productIds.length, 'products...');
      products = await enrichProducts(supabase, productIds);
      console.log('[Recommendations API] Enriched to', products.length, 'full products');
    }

    return NextResponse.json({
      success: true,
      recommendations: enrichData ? products : productIds.map(id => ({ id })),
      meta: {
        total: productIds.length,
        cache_hit: cacheHit,
        personalized: !!userId,
        algorithm_version: 'v1.0',
      },
    });

  } catch (error) {
    console.error('[Recommendations API] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate recommendations',
        success: false,
      },
      { status: 500 }
    );
  }
}

// ============================================================
// POST Handler - Refresh Recommendations
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const limit = Math.min(
      body.limit || DEFAULT_LIMIT,
      MAX_RECOMMENDATIONS
    );

    // Generate fresh recommendations
    const productIds = await generateHybridRecommendations(supabase, user.id, {
      limit,
      diversityFactor: 0.2,
    });

    // Clear old cache entries for this user
    await supabase
      .from('recommendation_cache')
      .delete()
      .eq('user_id', user.id)
      .eq('recommendation_type', 'personalized');

    // Cache new recommendations
    if (productIds.length > 0) {
      await cacheRecommendations(supabase, user.id, productIds, 'personalized');
    }

    // Enrich products
    const products = await enrichProducts(supabase, productIds);

    return NextResponse.json({
      success: true,
      recommendations: products,
      meta: {
        total: productIds.length,
        cache_hit: false,
        personalized: true,
        refreshed_at: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Recommendations API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh recommendations' },
      { status: 500 }
    );
  }
}

