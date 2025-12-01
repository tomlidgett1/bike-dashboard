/**
 * Trending Products API
 * 
 * Returns products with high trending scores (what's hot right now)
 * Supports category filtering and pagination
 * 
 * GET /api/marketplace/trending
 * Query params:
 *   - limit: number of products (default: 50)
 *   - category: filter by marketplace_category
 *   - page: pagination (default: 1)
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
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT)),
      MAX_LIMIT
    );
    const category = searchParams.get('category');

    const supabase = await createClient();

    // Simplified: Get product IDs from product_scores WHERE trending_score > 0
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
      // No trending products - return empty
      return NextResponse.json({
        success: true,
        products: [],
        pagination: { page: 1, limit, total: 0, hasMore: false },
        meta: { view_mode: 'trending', category_filter: category },
      });
    }

    const productIds = scores.map(s => s.product_id);

    // Get full product data with canonical images (same as marketplace/products)
    let productsQuery = supabase
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

    // Apply category filter
    if (category) {
      productsQuery = productsQuery.eq('marketplace_category', category);
    }

    const { data: products, error: productsError } = await productsQuery;

    if (productsError) {
      console.error('[Trending API] Products error:', productsError);
      return NextResponse.json(
        { error: 'Failed to fetch products', details: productsError.message },
        { status: 500 }
      );
    }

    // Transform to marketplace format (EXACT same logic as /api/marketplace/products)
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    const enriched = (products || []).map(product => {
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
        images: product.images, // Keep original images array
        created_at: product.created_at,
      };
    });

    // Maintain trending order
    const productMap = new Map(enriched.map(p => [p.id, p]));
    const ordered = productIds.map(id => productMap.get(id)).filter(Boolean);

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

