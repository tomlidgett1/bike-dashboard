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
import type { StoreProfile, StoreCategoryWithProducts, StoreSectionWithCategories } from '@/lib/types/store';
import { resolveProductImage } from '@/lib/services/image-resolver';
import { toCurrentHeroPublicId } from '@/lib/utils/cloudinary-transforms';

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

    // Fetch store profile - filter for verified bicycle stores in query for faster 404.
    // `homepage_config` is newest; if its migration hasn't run yet the query
    // errors, so we fall back to the base column set and treat it as null.
    const STORE_COLUMNS_FULL =
      'user_id, business_name, logo_url, store_type, address, phone, opening_hours, homepage_config, cover_image_url, bio, website, social_links';
    const STORE_COLUMNS_BASE =
      'user_id, business_name, logo_url, store_type, address, phone, opening_hours, cover_image_url, bio, website, social_links';

    let { data: storeUser, error: storeError } = await supabase
      .from('users')
      .select(STORE_COLUMNS_FULL)
      .eq('user_id', storeId)
      .eq('account_type', 'bicycle_store')
      .eq('bicycle_store', true)
      .single();

    if (storeError) {
      const fallback = await supabase
        .from('users')
        .select(STORE_COLUMNS_BASE)
        .eq('user_id', storeId)
        .eq('account_type', 'bicycle_store')
        .eq('bicycle_store', true)
        .single();
      storeUser = fallback.data ? { ...fallback.data, homepage_config: null } : null;
      storeError = fallback.error;
    }

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

    // Fetch active brands
    const { data: brands, error: brandsError } = await supabase
      .from('store_brands')
      .select('*')
      .eq('user_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (brandsError) {
      console.error('Error fetching brands:', brandsError);
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
        discount_percent,
        discount_active,
        discount_ends_at,
        sale_price,
        marketplace_category,
        marketplace_subcategory,
        category_name,
        manufacturer_name,
        qoh,
        model_year,
        created_at,
        user_id,
        listing_type,
        listing_source,
        uber_delivery_enabled,
        lightspeed_category_id,
        canonical_product_id,
        resolved_image_id,
        resolved_external_url,
        resolved_cloudinary_url,
        resolved_cloudinary_public_id,
        resolved_image_source
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

    // Helper: resolve image and shape one product row into the API response format
    const toMarketplaceProduct = (product: any) => {
      // Normalise hero PIDs to the current HERO_NORMALIZE_TRANSFORM.
      const effectivePublicId = toCurrentHeroPublicId(
        product.resolved_cloudinary_public_id,
        product.resolved_image_source
      );
      const resolved = resolveProductImage({
        id: product.resolved_image_id,
        cloudinary_public_id: effectivePublicId,
        cloudinary_url: product.resolved_cloudinary_url,
        external_url: product.resolved_external_url,
        approval_status: 'approved',
      });
      const primaryImageUrl = resolved?.card_url || resolved?.original_url;
      if (!primaryImageUrl) return null;
      return {
        id: product.id,
        description: product.description,
        display_name: product.display_name,
        price: parseFloat(product.price),
        discount_percent: product.discount_percent != null ? parseFloat(product.discount_percent) : null,
        discount_active: product.discount_active ?? false,
        discount_ends_at: product.discount_ends_at ?? null,
        sale_price: product.sale_price != null ? parseFloat(product.sale_price) : null,
        marketplace_category: product.marketplace_category || null,
        marketplace_subcategory: product.marketplace_subcategory || null,
        primary_image_url: primaryImageUrl,
        card_url: primaryImageUrl,
        cloudinary_public_id: effectivePublicId,
        thumbnail_url: resolved?.thumbnail_url || primaryImageUrl,
        detail_url: resolved?.detail_url || resolved?.gallery_url || primaryImageUrl,
        store_name: storeUser.business_name,
        store_logo_url: storeUser.logo_url,
        store_account_type: 'bicycle_store',
        store_bicycle_store: true,
        store_id: storeId,
        category: product.category_name,
        qoh: product.qoh,
        model_year: product.model_year,
        created_at: product.created_at,
        user_id: product.user_id,
        listing_type: 'store_inventory' as const,
        uber_delivery_enabled: product.uber_delivery_enabled ?? false,
      };
    };

    const categoriesWithProducts: StoreCategoryWithProducts[] = [];

    // Sort products by search relevance when a query is active
    let sortedProducts = allProducts ?? [];
    if (searchQuery && searchProductIds && searchProductIds.length > 0) {
      const orderMap = new Map(searchProductIds.map((id, index) => [id, index]));
      sortedProducts = [...sortedProducts].sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
      console.log('[STORE SEARCH] Products sorted by relevance');
    }

    // Fetch active store-defined categories (excludes display_override renaming entries).
    // Try with section_id first; if the column doesn't exist yet (migration pending),
    // fall back to the same query without it so existing carousels stay visible.
    const [categoriesResult, sectionsResult] = await Promise.all([
      supabase
        .from('store_categories')
        .select('id, name, source, lightspeed_category_id, brand_name, product_ids, display_order, carousel_size, section_id, logo_url, hide_title')
        .eq('user_id', storeId)
        .eq('is_active', true)
        .neq('source', 'display_override')
        .order('display_order', { ascending: true }),
      supabase
        .from('store_sections')
        .select('id, name, description, display_order')
        .eq('user_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
    ]);

    // Graceful fallback: if section_id column doesn't exist yet, retry without it
    let customCategories = categoriesResult.data;
    if (categoriesResult.error) {
      console.warn('[Store API] categories query error (section_id column may not exist yet):', categoriesResult.error.message);
      const fallback = await supabase
        .from('store_categories')
        .select('id, name, source, lightspeed_category_id, brand_name, product_ids, display_order, carousel_size, logo_url, hide_title')
        .eq('user_id', storeId)
        .eq('is_active', true)
        .neq('source', 'display_override')
        .order('display_order', { ascending: true });
      customCategories = fallback.data ? fallback.data.map((c) => ({ ...c, section_id: null })) : null;
    }

    // Sections are only available after migration — ignore errors silently
    const storeSections = sectionsResult.error ? null : sectionsResult.data;

    if (customCategories && customCategories.length > 0 && sortedProducts.length > 0) {
      // ── Mode A: use store-defined categories ──────────────────────────────
      // Lightspeed categories: match dynamically by lightspeed_category_id
      // Brand categories: match dynamically by manufacturer_name (case-insensitive)
      // Custom categories: match by explicit product_ids array
      const productById = new Map<string, any>(sortedProducts.map((p) => [p.id, p]));
      const matchedIds = new Set<string>();

      for (const cat of customCategories) {
        let catRawProducts: any[];

        if (cat.source === 'lightspeed' && cat.lightspeed_category_id) {
          catRawProducts = sortedProducts.filter(
            (p) => p.lightspeed_category_id === cat.lightspeed_category_id
          );
        } else if (cat.source === 'brand' && cat.brand_name) {
          const brandLower = cat.brand_name.toLowerCase();
          catRawProducts = sortedProducts.filter(
            (p) => (p.manufacturer_name ?? '').toLowerCase() === brandLower
          );
        } else if (cat.source === 'uber') {
          catRawProducts = sortedProducts.filter((p) => p.uber_delivery_enabled === true);
        } else {
          // custom: explicit product list
          catRawProducts = (cat.product_ids ?? [])
            .map((id: string) => productById.get(id))
            .filter(Boolean);
        }

        catRawProducts.forEach((p) => matchedIds.add(p.id));

        const marketplaceProducts = catRawProducts
          .map(toMarketplaceProduct)
          .filter((p): p is NonNullable<typeof p> => Boolean(p));

        if (marketplaceProducts.length > 0) {
          // Display-override name takes priority over the category's own name
          const displayName =
            displayNamesMap.get(cat.lightspeed_category_id ?? cat.name) ?? cat.name;
          categoriesWithProducts.push({
            id: cat.id,
            name: displayName,
            source: cat.source,
            display_order: cat.display_order,
            carousel_size: cat.carousel_size ?? 'normal',
            section_id: cat.section_id ?? null,
            logo_url: cat.logo_url ?? null,
            hide_title: cat.hide_title ?? false,
            products: marketplaceProducts,
            product_count: marketplaceProducts.length,
          });
        }
      }

      // Products not matched by any defined category → "Other" at the end
      const otherRaw = sortedProducts.filter((p) => !matchedIds.has(p.id));
      if (otherRaw.length > 0) {
        const otherProducts = otherRaw
          .map(toMarketplaceProduct)
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        if (otherProducts.length > 0) {
          categoriesWithProducts.push({
            id: 'category-other',
            name: 'Other',
            display_order: 9999,
            products: otherProducts,
            product_count: otherProducts.length,
          });
        }
      }
    } else if (sortedProducts.length > 0) {
      // ── Mode B: fallback — auto-group by raw category_name ────────────────
      const productsByCategory = new Map<string, any[]>();
      sortedProducts.forEach((product) => {
        const key = product.category_name || 'Uncategorized';
        if (!productsByCategory.has(key)) productsByCategory.set(key, []);
        productsByCategory.get(key)!.push(product);
      });

      Array.from(productsByCategory.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([categoryName, products], index) => {
          const marketplaceProducts = products
            .map(toMarketplaceProduct)
            .filter((p): p is NonNullable<typeof p> => Boolean(p));

          if (marketplaceProducts.length > 0) {
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

    // Build sections with their categories
    const sectionsWithCategories: StoreSectionWithCategories[] = (storeSections ?? []).map((sec) => ({
      id: sec.id,
      name: sec.name,
      description: sec.description ?? null,
      display_order: sec.display_order,
      categories: categoriesWithProducts.filter((c) => c.section_id === sec.id),
    })).filter((sec) => sec.categories.length > 0);

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
      sections: sectionsWithCategories,
      services: services || [],
      brands: brands || [],
      cover_image_url: (storeUser as any).cover_image_url || null,
      description: (storeUser as any).bio || null,
      website: (storeUser as any).website || null,
      social_links: (storeUser as any).social_links || null,
      homepage_config: (storeUser as any).homepage_config || null,
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

// PATCH /api/marketplace/store/[storeId]
// Update a category's logo_url (authenticated owner only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const supabase = await createClient();
    const { storeId } = await params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { categoryId, logo_url } = body;

    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('store_categories')
      .update({ logo_url: logo_url ?? null })
      .eq('id', categoryId)
      .eq('user_id', storeId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PATCH /api/marketplace/store/[storeId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
