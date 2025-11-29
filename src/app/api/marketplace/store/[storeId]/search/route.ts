/**
 * Store Instant Search API
 * 
 * GET /api/marketplace/store/[storeId]/search - Real-time search within a store's inventory
 * Returns top 10 matching products from the specific store
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const supabase = await createClient();
    const { storeId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    // Return empty results if query is too short
    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        products: [],
      });
    }

    const searchTerm = query.trim();
    console.log(`[STORE INSTANT SEARCH] Store: ${storeId}, Query: "${searchTerm}"`);

    // Use enterprise search function to get relevant products for this store
    const { data: searchResults, error: searchError } = await supabase
      .rpc('search_marketplace_products', { 
        search_query: searchTerm,
        similarity_threshold: 0.15
      });

    // Get product IDs from search results
    const productIds = searchResults?.slice(0, 20).map((r: any) => r.product_id) || [];

    console.log(`[STORE INSTANT SEARCH] Found ${productIds.length} potential matches`);

    if (searchError || productIds.length === 0) {
      return NextResponse.json({
        products: [],
      });
    }

    // Fetch full product details for the search results, filtered by store
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        price,
        category_name,
        qoh,
        use_custom_image,
        custom_image_url,
        primary_image_url,
        canonical_product_id,
        canonical_products!canonical_product_id (
          id,
          product_images!canonical_product_id (
            id,
            storage_path,
            is_primary,
            variants
          )
        )
      `)
      .eq('user_id', storeId)
      .eq('is_active', true)
      .gt('qoh', 0)
      .in('id', productIds)
      .limit(10);

    if (productsError) {
      console.error('Products query error:', productsError);
      return NextResponse.json({
        products: [],
      });
    }

    // Transform products data
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    let products = (productsData || [])
      .map((product: any) => {
        // Determine image URL
        let imageUrl = null;
        
        if (product.use_custom_image && product.custom_image_url) {
          imageUrl = product.custom_image_url;
        } 
        else if (product.canonical_products?.product_images) {
          const images = product.canonical_products.product_images;
          const primaryImage = images.find((img: any) => img.is_primary);
          
          if (primaryImage) {
            if (primaryImage.variants?.thumbnail) {
              imageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.variants.thumbnail}`;
            } else if (primaryImage.variants?.small) {
              imageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.variants.small}`;
            } else if (primaryImage.storage_path) {
              imageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.storage_path}`;
            }
          }
        }
        else if (product.primary_image_url) {
          imageUrl = product.primary_image_url;
        }

        return {
          id: product.id,
          name: product.display_name || product.description,
          price: product.price,
          category: product.category_name || 'Uncategorized',
          imageUrl,
          inStock: (product.qoh || 0) > 0,
        };
      });

    // Sort by relevance order from search function
    if (productIds.length > 0) {
      const orderMap = new Map<string, number>(productIds.map((id: string, index: number) => [id, index]));
      products.sort((a, b) => {
        const orderA: number = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB: number = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    }

    console.log(`[STORE INSTANT SEARCH] Returning ${products.length} products`);

    return NextResponse.json({
      products,
      query: searchTerm,
    });
  } catch (error) {
    console.error('Store instant search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}

