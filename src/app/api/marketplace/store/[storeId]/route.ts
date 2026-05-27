/**
 * Public Store Profile API
 * 
 * Fetches public store profile including:
 * - Store info (name, logo, type, address, phone, opening_hours)
 * - Active categories with products
 * - Active services
 * - Product counts per category
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { StoreProfile, StoreCategoryWithProducts } from '@/lib/types/store';
import { resolveProductImage } from '@/lib/services/image-resolver';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const supabase = await createClient();
    const { storeId } = await params;
    
    // Get search query from URL
    const searchParams = request.nextUrl.searchParams;
    const searchQuery = searchParams.get('search');

    if (!storeId) {
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      );
    }

    // Fetch store profile - filter for verified bicycle stores in query for faster 404
    const { data: storeUser, error: storeError } = await supabase
      .from('users')
      .select('user_id, business_name, logo_url, store_type, address, phone, opening_hours')
      .eq('user_id', storeId)
      .eq('account_type', 'bicycle_store')
      .eq('bicycle_store', true)
      .single();

    if (storeError || !storeUser) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    // Fetch active services
    const { data: services, error: servicesError } = await supabase
      .from('store_services')
      .select('*')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (servicesError) {
      console.error('Error fetching services:', servicesError);
    }

    // Fetch display name overrides
    const { data: displayOverrides } = await supabase
      .from('store_categories')
      .select('lightspeed_category_id, name')
      .eq('user_id', storeId)
      .eq('source', 'display_override');

    const displayNamesMap = new Map(
      displayOverrides?.map(o => [o.lightspeed_category_id, o.name]) || []
    );

    // If search query provided, use enterprise search to get filtered product IDs
    let searchProductIds: string[] | null = null;
    if (searchQuery && searchQuery.trim()) {
      const { data: searchResults, error: searchError } = await supabase
        .rpc('search_marketplace_products', { 
          search_query: searchQuery.trim(),
          similarity_threshold: 0.15
        });

      if (!searchError && searchResults) {
        searchProductIds = searchResults.map((r: any) => r.product_id);
        console.log(`[STORE SEARCH] Found ${searchProductIds?.length || 0} matching products`);
      } else if (searchError) {
        console.error('[STORE SEARCH] Error:', searchError);
      }
    }

    // Fetch products from the readiness view so image approval and primary
    // resolution happen before the store profile groups products.
    let productsQuery = supabase
      .from('marketplace_ready_products')
      .select(`
        id,
        description,
        display_name,
        price,
        marketplace_category,
        marketplace_subcategory,
        category_name,
        qoh,
        model_year,
        created_at,
        user_id,
        listing_type,
        lightspeed_category_id,
        canonical_product_id,
        resolved_image_id,
        resolved_card_url,
        resolved_thumbnail_url,
        resolved_mobile_card_url,
        resolved_gallery_url,
        resolved_detail_url,
        resolved_cloudinary_url,
        resolved_cloudinary_public_id
      `)
      .eq('user_id', storeId)
      .gt('qoh', 0);

    // Apply search filter if we have search results
    if (searchQuery && searchProductIds) {
      if (searchProductIds.length > 0) {
        productsQuery = productsQuery.in('id', searchProductIds);
      } else {
        // No results found - return empty
        productsQuery = productsQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
      }
    }

    const { data: allProducts, error: productsError } = await productsQuery.limit(10000);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    // Group products by their category_name (same as Products page)
    const categoriesWithProducts: StoreCategoryWithProducts[] = [];

    if (allProducts && allProducts.length > 0) {
      // Sort products by relevance if search is active
      let sortedProducts = allProducts;
      if (searchQuery && searchProductIds && searchProductIds.length > 0) {
        const orderMap = new Map(searchProductIds.map((id, index) => [id, index]));
        sortedProducts = [...allProducts].sort((a, b) => {
          const orderA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const orderB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        });
        console.log('[STORE SEARCH] Products sorted by relevance');
      }

      // Group products by category
      const productsByCategory = new Map<string, any[]>();
      
      sortedProducts.forEach((product) => {
        const categoryName = product.category_name || 'Uncategorized';
        if (!productsByCategory.has(categoryName)) {
          productsByCategory.set(categoryName, []);
        }
        productsByCategory.get(categoryName)!.push(product);
      });

      // Convert to array and sort by product count (descending)
      const sortedCategories = Array.from(productsByCategory.entries())
        .sort((a, b) => b[1].length - a[1].length);

      // Build categories with products using the resolved image source of truth.
      sortedCategories.forEach(([categoryName, products], index) => {
        const marketplaceProducts = products
          .map((product) => {
            const resolved = resolveProductImage({
              id: product.resolved_image_id,
              cloudinary_public_id: product.resolved_cloudinary_public_id,
              cloudinary_url: product.resolved_cloudinary_url,
              thumbnail_url: product.resolved_thumbnail_url,
              mobile_card_url: product.resolved_mobile_card_url,
              card_url: product.resolved_card_url,
              gallery_url: product.resolved_gallery_url,
              detail_url: product.resolved_detail_url,
              approval_status: 'approved',
            });

            const primaryImageUrl = resolved?.card_url || resolved?.original_url;
            if (!primaryImageUrl) return null;

            return {
              id: product.id,
              description: product.description,
              display_name: product.display_name, // Include cleaned AI name
              price: parseFloat(product.price),
              marketplace_category: product.marketplace_category || null,
              marketplace_subcategory: product.marketplace_subcategory || null,
              primary_image_url: primaryImageUrl,
              card_url: primaryImageUrl,
              thumbnail_url: resolved?.thumbnail_url || primaryImageUrl,
              detail_url: resolved?.detail_url || resolved?.gallery_url || primaryImageUrl,
              store_name: storeUser.business_name,
              store_logo_url: storeUser.logo_url,
              store_id: storeId,
              category: product.category_name,
              qoh: product.qoh,
              model_year: product.model_year,
              created_at: product.created_at,
              user_id: product.user_id,
              listing_type: 'store_inventory' as const,
            };
          })
          .filter((product): product is NonNullable<typeof product> => Boolean(product));

        // Only add category if it has products with images
        if (marketplaceProducts.length > 0) {
          // Use display override name if exists
          const displayName = displayNamesMap.get(categoryName) || categoryName;

          categoriesWithProducts.push({
            id: `category-${index}`,
            name: displayName,
            display_order: index,
            products: marketplaceProducts,
            product_count: marketplaceProducts.length,
          });
        }
      });
    }

    // Build store profile response
    const storeProfile: StoreProfile = {
      id: storeId,
      store_name: storeUser.business_name,
      logo_url: storeUser.logo_url,
      store_type: storeUser.store_type,
      address: storeUser.address,
      phone: storeUser.phone,
      opening_hours: storeUser.opening_hours || {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { open: '10:00', close: '16:00', closed: false },
        sunday: { open: '10:00', close: '16:00', closed: true },
      },
      categories: categoriesWithProducts,
      services: services || [],
    };

    return NextResponse.json({ store: storeProfile });
  } catch (error) {
    console.error('Error in GET /api/marketplace/store/[storeId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

