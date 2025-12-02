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

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Enable ISR caching - trending updates every 15 minutes
export const revalidate = 900; // 15 minutes

// Deploy to edge runtime for global CDN distribution
export const runtime = 'edge';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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
      // RPC successful - transform and return
      // IMPORTANT: Only show products with Cloudinary images
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      
      const enriched = (products || []).map((product: any) => {
        let primaryImageUrl = product.primary_image_url;
        let allImages: string[] = [];
        let hasCloudinaryImage = false;
        
        // Priority 1: Private listing images - check for cloudinary URLs
        if (product.listing_type === 'private_listing' && Array.isArray(product.images) && product.images.length > 0) {
          const cloudinaryImage = product.images.find((img: any) => 
            img.url?.includes('cloudinary') || img.cloudinaryUrl
          );
          if (cloudinaryImage) {
            hasCloudinaryImage = true;
            const primaryImage = product.images.find((img: any) => img.isPrimary) || product.images[0];
            if (primaryImage?.url) {
              primaryImageUrl = primaryImage.url;
            }
            allImages = product.images.map((img: any) => img.url).filter(Boolean);
          }
        }
        // Priority 2: Custom store image - check for cloudinary URL
        else if (product.use_custom_image && product.custom_image_url) {
          if (product.custom_image_url.includes('cloudinary')) {
            hasCloudinaryImage = true;
            primaryImageUrl = product.custom_image_url;
            allImages.push(product.custom_image_url);
          }
        }
        // Priority 3: Check if primary_image_url is from cloudinary
        else if (primaryImageUrl && primaryImageUrl.includes('cloudinary')) {
          hasCloudinaryImage = true;
          allImages.push(primaryImageUrl);
        }
        
        // FILTER: Skip products without cloudinary images
        if (!hasCloudinaryImage || !primaryImageUrl) {
          return null;
        }
      
        return {
          id: product.id,
          description: product.description,
          display_name: product.display_name,
          price: parseFloat(product.price) || 0,
          marketplace_category: product.marketplace_category,
          marketplace_subcategory: product.marketplace_subcategory,
          primary_image_url: primaryImageUrl,
          all_images: allImages.length > 0 ? allImages : [primaryImageUrl],
          user_id: product.user_id,
          store_name: product.store_name || 'Unknown Store',
          store_logo_url: product.store_logo_url || null,
          listing_type: product.listing_type,
          images: product.images,
          created_at: product.created_at,
        };
      }).filter(Boolean); // Filter out null products (no cloudinary image)
      
      console.log(`🖼️ [TRENDING] Filtered to ${enriched.length} products with Cloudinary images`);

      const queryTime = performance.now() - startTime;
      console.log(`⚡ [TRENDING] Fetched ${enriched.length} products in ${queryTime.toFixed(0)}ms (RPC)`);

      return NextResponse.json({
        success: true,
        products: enriched,
        pagination: {
          page: 1,
          limit,
          total: enriched.length,
          hasMore: false,
        },
        meta: {
          view_mode: 'trending',
          category_filter: category,
          response_time_ms: queryTime.toFixed(0),
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
      return NextResponse.json({
        success: true,
        products: [],
        pagination: { page: 1, limit, total: 0, hasMore: false },
        meta: { view_mode: 'trending', category_filter: category },
      });
    }

    const productIds = scores.map(s => s.product_id);

    // Get full product data
    let productsQuery = supabase
      .from('products')
      .select(`
        *,
        users!user_id (
          business_name,
          logo_url
        )
      `)
      .in('id', productIds)
      .eq('is_active', true);

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

    // Transform to marketplace format - only products with Cloudinary images
    const enriched = (fallbackProducts || []).map((product: any) => {
      let primaryImageUrl = product.primary_image_url;
      let allImages: string[] = [];
      let hasCloudinaryImage = false;
      
      if (product.listing_type === 'private_listing' && Array.isArray(product.images) && product.images.length > 0) {
        const cloudinaryImage = product.images.find((img: any) => 
          img.url?.includes('cloudinary') || img.cloudinaryUrl
        );
        if (cloudinaryImage) {
          hasCloudinaryImage = true;
          const primaryImage = product.images.find((img: any) => img.isPrimary) || product.images[0];
          if (primaryImage?.url) {
            primaryImageUrl = primaryImage.url;
          }
          allImages = product.images.map((img: any) => img.url).filter(Boolean);
        }
      } else if (product.use_custom_image && product.custom_image_url) {
        if (product.custom_image_url.includes('cloudinary')) {
          hasCloudinaryImage = true;
          primaryImageUrl = product.custom_image_url;
          allImages.push(product.custom_image_url);
        }
      } else if (primaryImageUrl && primaryImageUrl.includes('cloudinary')) {
        hasCloudinaryImage = true;
        allImages.push(primaryImageUrl);
      }
      
      // FILTER: Skip products without cloudinary images
      if (!hasCloudinaryImage || !primaryImageUrl) {
        return null;
      }
    
      return {
        id: product.id,
        description: product.description,
        display_name: product.display_name,
        price: parseFloat(product.price) || 0,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        primary_image_url: primaryImageUrl,
        all_images: allImages.length > 0 ? allImages : [primaryImageUrl],
        user_id: product.user_id,
        store_name: product.users?.business_name || 'Unknown Store',
        store_logo_url: product.users?.logo_url || null,
        listing_type: product.listing_type,
        images: product.images,
        created_at: product.created_at,
      };
    }).filter(Boolean);

    // Maintain trending order
    const productMap = new Map(enriched.map((p: any) => [p.id, p]));
    const ordered = productIds.map(id => productMap.get(id)).filter(Boolean);

    const queryTime = performance.now() - startTime;
    console.log(`⚡ [TRENDING] Fetched ${ordered.length} products in ${queryTime.toFixed(0)}ms (fallback)`);

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

