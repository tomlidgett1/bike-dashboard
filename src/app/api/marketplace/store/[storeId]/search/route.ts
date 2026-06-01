/**
 * Store Instant Search API
 *
 * GET /api/marketplace/store/[storeId]/search - Real-time search within a store's inventory
 * Returns top 10 matching products from the specific store
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveProductImage } from '@/lib/services/image-resolver';
import { toCurrentHeroPublicId } from '@/lib/utils/cloudinary-transforms';

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

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ products: [] });
    }

    const searchTerm = query.trim();

    // Get ranked product IDs for this store
    const { data: searchResults, error: searchError } = await supabase
      .rpc('search_marketplace_products', {
        search_query: searchTerm,
        similarity_threshold: 0.15,
      });

    const productIds: string[] = searchResults?.slice(0, 20).map((r: any) => r.product_id) || [];

    if (searchError || productIds.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // Fetch resolved image data from the canonical view, filtered to this store
    const { data: productsData, error: productsError } = await supabase
      .from('marketplace_ready_products')
      .select(`
        id,
        display_name,
        description,
        price,
        category_name,
        qoh,
        resolved_image_id,
        resolved_image_source,
        resolved_external_url,
        resolved_cloudinary_url,
        resolved_cloudinary_public_id
      `)
      .eq('user_id', storeId)
      .in('id', productIds)
      .limit(10);

    if (productsError) {
      console.error('[STORE SEARCH] Products query error:', productsError);
      return NextResponse.json({ products: [] });
    }

    const products = (productsData || [])
      .map((product: any) => {
        const effectivePid = toCurrentHeroPublicId(
          product.resolved_cloudinary_public_id,
          product.resolved_image_source
        );

        const resolved = resolveProductImage({
          id: product.resolved_image_id,
          cloudinary_public_id: effectivePid,
          cloudinary_url: product.resolved_cloudinary_url,
          external_url: product.resolved_external_url,
          approval_status: 'approved',
        });

        const imageUrl = resolved?.thumbnail_url || resolved?.card_url || resolved?.original_url || null;

        return {
          id: product.id,
          name: product.display_name || product.description,
          price: product.price,
          category: product.category_name || 'Uncategorized',
          imageUrl,
          inStock: (product.qoh || 0) > 0,
        };
      });

    // Re-sort by the relevance order returned by the search function
    if (productIds.length > 0) {
      const orderMap = new Map<string, number>(productIds.map((id: string, index: number) => [id, index]));
      products.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    }

    return NextResponse.json({ products, query: searchTerm });
  } catch (error) {
    console.error('[STORE SEARCH] Error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
