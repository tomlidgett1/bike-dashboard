/**
 * Instant Search API
 * 
 * GET /api/marketplace/search - Real-time search for products and stores
 * Returns top 5 products and matching stores for instant search dropdown
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    // Use enterprise search function for better results
    const { data: searchResults, error: searchError } = await supabase
      .rpc('search_marketplace_products', { 
        search_query: searchTerm,
        similarity_threshold: 0.15
      });

    // Get top 10 product IDs from search results (increased from 5)
    const productIds = searchResults?.slice(0, 10).map((r: any) => r.product_id) || [];

    console.log(`[INSTANT SEARCH] Enterprise search found ${searchResults?.length || 0} results, showing top ${productIds.length}`);

    // If no results or error, return empty
    if (searchError || !productIds.length) {
      console.log('[INSTANT SEARCH] No products found or search error:', searchError);
    }

    // Fetch full product details for the search results
    let productsQuery = supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        price,
        marketplace_category,
        marketplace_subcategory,
        marketplace_level_3_category,
        qoh,
        user_id,
        canonical_product_id,
        use_custom_image,
        custom_image_url,
        model_year,
        listing_type,
        listing_source,
        listing_status,
        frame_size,
        frame_material,
        bike_type,
        groupset,
        wheel_size,
        suspension_type,
        bike_weight,
        color_primary,
        color_secondary,
        part_type_detail,
        compatibility_notes,
        material,
        weight,
        size,
        gender_fit,
        apparel_material,
        condition_rating,
        condition_details,
        wear_notes,
        usage_estimate,
        purchase_location,
        purchase_date,
        service_history,
        upgrades_modifications,
        reason_for_selling,
        is_negotiable,
        shipping_available,
        shipping_cost,
        pickup_location,
        included_accessories,
        seller_contact_preference,
        seller_phone,
        seller_email,
        published_at,
        expires_at,
        images,
        primary_image_url,
        users!user_id (
          business_name,
          logo_url
        ),
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
      `)
      .eq('is_active', true)
      .or('listing_status.is.null,listing_status.eq.active')
      .in('id', productIds.length > 0 ? productIds : ['00000000-0000-0000-0000-000000000000']);

    // Search stores - match business name
    const storesQuery = supabase
      .from('users')
      .select(`
        user_id,
        business_name,
        logo_url,
        created_at
      `)
      .ilike('business_name', `%${searchTerm}%`)
      .not('business_name', 'is', null)
      .limit(3);

    // Execute both queries in parallel
    const [productsResult, storesResult] = await Promise.all([
      productsQuery,
      storesQuery,
    ]);

    if (productsResult.error) {
      console.error('Products search error:', productsResult.error);
    }

    if (storesResult.error) {
      console.error('Stores search error:', storesResult.error);
    }

    console.log(`[SEARCH] Query: "${searchTerm}"`);
    console.log(`[SEARCH] Found ${productsResult.data?.length || 0} products`);
    console.log(`[SEARCH] Found ${storesResult.data?.length || 0} users matching business name`);

    // Transform products data
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    let products = (productsResult.data || [])
      .map((product: any) => {
        // Determine image URL (same logic as marketplace products API)
        let imageUrl = null;
        
        // Priority 1: Custom store image
        if (product.use_custom_image && product.custom_image_url) {
          imageUrl = product.custom_image_url;
        } 
        // Priority 2: Canonical product images (MUST have is_primary set)
        else if (product.canonical_products?.product_images) {
          const images = product.canonical_products.product_images;
          // ONLY use image if it has is_primary flag set
          const primaryImage = images.find((img: any) => img.is_primary);
          
          if (primaryImage) {
            // Use thumbnail variant for fast loading in dropdown
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

        // If no primary image found, return null (will be filtered out)
        if (!imageUrl) {
          console.log(`🚫 [SEARCH FILTER] Excluding product ${product.id} - no primary image`);
          return null;
        }

        return {
          id: product.id,
          name: product.display_name || product.description, // Use cleaned display_name first
          price: product.price,
          category: product.marketplace_category,
          imageUrl,
          storeName: product.users?.business_name || 'Unknown Store',
          inStock: (product.qoh || 0) > 0,
        };
      })
      .filter(Boolean); // Remove products without images

    // Sort products by relevance order from search function
    if (productIds.length > 0) {
      const orderMap = new Map<string, number>(productIds.map((id: string, index: number) => [id, index]));
      products.sort((a, b) => {
        if (!a || !b) return 0;
        const orderA: number = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB: number = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
      console.log('[INSTANT SEARCH] Products sorted by relevance');
    }

    // Transform stores data - only include stores that have products
    const storesWithProducts = await Promise.all(
      (storesResult.data || []).map(async (store: any) => {
        // Check if store has any active products
        const { count } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', store.user_id)
          .eq('is_active', true);

        if ((count || 0) === 0) return null;

        return {
          id: store.user_id,
          name: store.business_name,
          logoUrl: store.logo_url,
          productCount: count || 0,
        };
      })
    );

    const stores = storesWithProducts.filter(Boolean);

    console.log(`[SEARCH] Returning ${products.length} products, ${stores.length} stores`);

    return NextResponse.json({
      products,
      stores,
      query: searchTerm,
    });
  } catch (error) {
    console.error('Instant search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}

