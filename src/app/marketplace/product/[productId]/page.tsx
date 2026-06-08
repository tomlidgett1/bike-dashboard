import * as React from "react";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { ProductPageClient } from "./product-page-client";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { getProductImages, toJsonbFormat } from "@/lib/services/product-images";
import { resolveProductImage, getProductImageSlotUrl } from "@/lib/services/image-resolver";
import { toCurrentHeroPublicId } from "@/lib/utils/cloudinary-transforms";
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";

// ============================================================
// Product Page - Server Component with Parallel Data Fetching
// Fetches all data on server for optimal performance
// Uses ISR (Incremental Static Regeneration) for cached, fast loads
// ============================================================

// Use ISR - cache product pages for 60 seconds, then revalidate in background
// This dramatically improves load times for repeat visitors
export const revalidate = 60;

interface SellerInfo {
  id: string;
  name: string;
  logo_url: string | null;
  account_type: string | null;
}

// Helper function to fetch product data
// allowSoldProducts: When true, allows fetching products regardless of listing_status
// This is used when viewing purchased products from order history
async function fetchProduct(productId: string, allowSoldProducts: boolean = false): Promise<MarketplaceProduct | null> {
  try {
    const supabase = createPublicSupabaseClient();

    let query = supabase
      .from('products')
      .select(`
        id,
        description,
        product_description,
        product_specs,
        product_spec_sources,
        display_name,
        price,
        discount_percent,
        discount_active,
        discount_ends_at,
        sale_price,
        marketplace_category,
        marketplace_subcategory,
        marketplace_level_3_category,
        qoh,
        model_year,
        created_at,
        user_id,
        canonical_product_id,
        selected_product_image_id,
        use_custom_image,
        custom_image_url,
        images,
        listing_type,
        listing_source,
        listing_status,
        published_at,
        sold_at,
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
        seller_notes,
        wear_notes,
        usage_estimate,
        purchase_location,
        purchase_date,
        service_history,
        upgrades_modifications,
        manufacturer_name,
        brand,
        model,
        reason_for_selling,
        is_negotiable,
        shipping_available,
        shipping_cost,
        pickup_location,
        included_accessories,
        seller_contact_preference,
        seller_phone,
        seller_email,
        uber_delivery_enabled,
        is_bicycle,
        bike_specs,
        users!user_id (
          business_name,
          name,
          logo_url,
          account_type,
          bicycle_store
        )
      `)
      .eq('id', productId);

    // Only filter by listing_status if not allowing sold products
    if (!allowSoldProducts) {
      query = query.or('listing_status.is.null,listing_status.eq.active');
    }

    const { data: product, error: productError } = await query.single();

    if (productError || !product) {
      return null;
    }

    // ============================================================
    // REFACTORED: Fetch images from product_images table (source of truth)
    // This replaces the JSONB approach for cleaner data model
    // ============================================================
    const user = (product.users as any);
    let primaryImageUrl: string | null = null;
    let allImages: string[] = [];
    let imagesForClient: Array<{
      id: string;
      url: string;
      cardUrl: string | null;
      galleryUrl: string | null;
      detailUrl: string | null;
      isPrimary: boolean;
      order: number;
    }> = [];
    
    const [productImages, immersivePage] = await Promise.all([
      getProductImages(supabase, productId, product.canonical_product_id),
      fetchImmersivePageFlag(supabase, productId),
    ]);
    
    if (productImages.length > 0) {
      // Convert to JSONB format for backwards compatibility with client
      imagesForClient = toJsonbFormat(productImages) as any;
      
      const primaryImage =
        productImages.find(img => img.id === product.selected_product_image_id) ||
        productImages.find(img => img.is_primary) ||
        productImages[0];
      // Single source of truth: the web_hero variant is computed from the public_id.
      primaryImageUrl = getProductImageSlotUrl(primaryImage, 'web_hero');

      allImages = productImages
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(img => getProductImageSlotUrl(img, 'web_hero'))
        .filter((url): url is string => !!url && !url.startsWith('blob:'));
    }
    // Fallback to JSONB during transition
    else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const cachedImages = product.images as Array<{ 
        url?: string; 
        cardUrl?: string; 
        galleryUrl?: string; 
        detailUrl?: string; 
        isPrimary?: boolean; 
        order?: number;
        source?: string;
      }>;
      
      imagesForClient = cachedImages as any;
      
      const primaryImage = cachedImages.find(img => img.isPrimary) || cachedImages[0];
      primaryImageUrl = primaryImage?.galleryUrl || primaryImage?.detailUrl || primaryImage?.url || primaryImage?.cardUrl || null;
      
      allImages = cachedImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(img => img.galleryUrl || img.detailUrl || img.url || img.cardUrl)
        .filter((url): url is string => !!url && !url.startsWith('blob:'));
    } 
    // Fallback: Custom image
    else if (product.use_custom_image && product.custom_image_url) {
      primaryImageUrl = product.custom_image_url;
      allImages = [product.custom_image_url];
    } 
    // Final fallback: Placeholder
    else {
      primaryImageUrl = '/placeholder-product.svg';
      allImages = ['/placeholder-product.svg'];
    }
    
    // Format seller name: For bike stores use business_name, for individuals use "FirstName L."
    let displayName = 'Unknown Seller';
    if (user?.account_type === 'bicycle_store' && user?.business_name) {
      displayName = user.business_name;
    } else if (user?.name) {
      const nameParts = user.name.trim().split(' ');
      if (nameParts.length >= 2) {
        // Format as "FirstName L."
        displayName = `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`;
      } else {
        // Just use the first name if only one name provided
        displayName = nameParts[0];
      }
    }

    return {
      ...product,
      primary_image_url: primaryImageUrl,
      all_images: allImages,
      images: imagesForClient.length > 0 ? imagesForClient : product.images,
      image_variants: null,
      immersive_page: immersivePage,
      uber_delivery_enabled: product.uber_delivery_enabled ?? false,
      brand: product.brand || product.manufacturer_name || null,
      store_name: displayName,
      store_logo_url: user?.logo_url || null,
      store_account_type: user?.account_type || null,
      store_bicycle_store: user?.bicycle_store ?? null,
    };
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

async function fetchImmersivePageFlag(
  supabase: ReturnType<typeof createPublicSupabaseClient>,
  productId: string,
): Promise<boolean> {
  // Read defensively so older databases without the immersive_page column still
  // render the regular product page.
  const { data, error } = await supabase
    .from('products')
    .select('immersive_page')
    .eq('id', productId)
    .maybeSingle();

  if (error) return false;
  return !!(data as any)?.immersive_page;
}

async function fetchPublicCardProducts(
  buildQuery: (
    supabase: ReturnType<typeof createPublicSupabaseClient>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
): Promise<MarketplaceProduct[] | null> {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await buildQuery(supabase);

  if (hasMissingPublicCardFeedError(error)) return null;
  if (error) {
    console.warn('[PRODUCT PAGE] Public-card carousel lookup failed:', error.message);
    return null;
  }

  return ((data || []) as PublicMarketplaceCardRow[]).map(transformPublicMarketplaceCard);
}

async function fetchSimilarProductsFromPublicCards(product: MarketplaceProduct): Promise<MarketplaceProduct[] | null> {
  if (!product.marketplace_category) return [];

  return fetchPublicCardProducts((supabase) => {
    let query = supabase
      .from('public_marketplace_cards')
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .eq('marketplace_category', product.marketplace_category)
      .neq('id', product.id);

    if (product.marketplace_subcategory) {
      query = query.eq('marketplace_subcategory', product.marketplace_subcategory);
    }

    return query
      .order('created_at', { ascending: false })
      .limit(12);
  });
}

async function fetchBrandProductsFromPublicCards(productId: string, brand: string): Promise<MarketplaceProduct[] | null> {
  const normalizedBrand = brand.trim();
  if (!normalizedBrand) return [];

  return fetchPublicCardProducts((supabase) =>
    supabase
      .from('public_marketplace_cards')
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .ilike('brand', normalizedBrand)
      .neq('id', productId)
      .order('created_at', { ascending: false })
      .limit(12)
  );
}

async function fetchSellerProductsFromPublicCards(
  product: MarketplaceProduct,
): Promise<{ products: MarketplaceProduct[]; seller: SellerInfo | null } | null> {
  if (!product.user_id) return { products: [], seller: null };

  const products = await fetchPublicCardProducts((supabase) =>
    supabase
      .from('public_marketplace_cards')
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .eq('user_id', product.user_id)
      .neq('id', product.id)
      .order('created_at', { ascending: false })
      .limit(12)
  );

  if (!products) return null;

  return {
    products,
    seller: {
      id: product.user_id,
      name: product.store_name || 'Unknown Seller',
      logo_url: product.store_logo_url || null,
      account_type: product.store_account_type || null,
    },
  };
}

// Helper function to fetch similar products - DIRECTLY from Supabase (no API call)
async function fetchSimilarProductsFallback(product: MarketplaceProduct): Promise<MarketplaceProduct[]> {
  try {
    const supabase = createPublicSupabaseClient();
    
    if (!product.marketplace_category) return [];
    
    // Fetch similar ready products from same category
    const { data: products } = await supabase
      .from('marketplace_ready_products')
      .select(`
        id, description, display_name, price, discount_percent, discount_active, discount_ends_at, sale_price, qoh, model_year, marketplace_category, marketplace_subcategory,
        marketplace_level_3_category, created_at, user_id,
        resolved_image_id, resolved_image_source, resolved_external_url, resolved_cloudinary_url, resolved_cloudinary_public_id
      `)
      .eq('marketplace_category', product.marketplace_category)
      .neq('id', product.id)
      .limit(12);

    if (!products) return [];

    return products.map((p: any) => {
      const effectivePid = toCurrentHeroPublicId(
        p.resolved_cloudinary_public_id,
        p.resolved_image_source
      );
      const resolved = resolveProductImage({
        id: p.resolved_image_id,
        cloudinary_public_id: effectivePid,
        cloudinary_url: p.resolved_cloudinary_url,
        external_url: p.resolved_external_url,
        approval_status: 'approved',
      });
      const imageUrl = resolved?.card_url || resolved?.original_url || null;

      return {
        id: p.id,
        description: p.description,
        display_name: p.display_name,
        price: p.price,
        discount_percent: p.discount_percent,
        discount_active: p.discount_active,
        discount_ends_at: p.discount_ends_at,
        sale_price: p.sale_price,
        marketplace_category: p.marketplace_category,
        marketplace_subcategory: p.marketplace_subcategory,
        marketplace_level_3_category: p.marketplace_level_3_category,
        qoh: p.qoh || 1,
        model_year: p.model_year || null,
        created_at: p.created_at,
        user_id: p.user_id,
        primary_image_url: imageUrl,
        card_url: imageUrl,
        cloudinary_public_id: effectivePid,
        thumbnail_url: resolved?.thumbnail_url || imageUrl,
        detail_url: resolved?.detail_url || resolved?.gallery_url || imageUrl,
        store_name: 'Bike Store',
        store_logo_url: null,
        store_account_type: null,
      } as MarketplaceProduct;
    });
  } catch (error) {
    console.error('Error fetching similar products:', error);
    return [];
  }
}

// Helper function to fetch products from the same brand
async function fetchBrandProducts(productId: string, brand: string): Promise<MarketplaceProduct[]> {
  const fastProducts = await fetchBrandProductsFromPublicCards(productId, brand);
  if (fastProducts) return fastProducts;

  const normalizedBrand = brand.trim();
  if (!normalizedBrand) return [];
  try {
    const supabase = createPublicSupabaseClient();

    const { data: products } = await supabase
      .from('marketplace_ready_products')
      .select(`
        id, description, display_name, price, discount_percent, discount_active, discount_ends_at, sale_price, qoh, model_year, marketplace_category, marketplace_subcategory,
        created_at, user_id, brand, manufacturer_name,
        resolved_image_id, resolved_image_source, resolved_external_url, resolved_cloudinary_url, resolved_cloudinary_public_id
      `)
      .or(`brand.ilike.${normalizedBrand},manufacturer_name.ilike.${normalizedBrand}`)
      .neq('id', productId)
      .is('sold_at', null)
      .order('created_at', { ascending: false })
      .limit(12);

    if (!products) return [];

    return products.map((p: any) => {
      const effectivePid = toCurrentHeroPublicId(
        p.resolved_cloudinary_public_id,
        p.resolved_image_source
      );
      const resolved = resolveProductImage({
        id: p.resolved_image_id,
        cloudinary_public_id: effectivePid,
        cloudinary_url: p.resolved_cloudinary_url,
        external_url: p.resolved_external_url,
        approval_status: 'approved',
      });
      const imageUrl = resolved?.card_url || resolved?.original_url || null;

      return {
        id: p.id,
        description: p.description,
        display_name: p.display_name,
        price: p.price,
        discount_percent: p.discount_percent,
        discount_active: p.discount_active,
        discount_ends_at: p.discount_ends_at,
        sale_price: p.sale_price,
        marketplace_category: p.marketplace_category,
        marketplace_subcategory: p.marketplace_subcategory,
        qoh: p.qoh || 1,
        model_year: p.model_year || null,
        created_at: p.created_at,
        user_id: p.user_id,
        brand: p.brand || p.manufacturer_name || null,
        primary_image_url: imageUrl,
        card_url: imageUrl,
        cloudinary_public_id: effectivePid,
        thumbnail_url: resolved?.thumbnail_url || imageUrl,
        detail_url: resolved?.detail_url || resolved?.gallery_url || imageUrl,
        store_name: 'Bike Store',
        store_logo_url: null,
        store_account_type: null,
      } as MarketplaceProduct;
    });
  } catch (error) {
    console.error('Error fetching brand products:', error);
    return [];
  }
}

// Helper function to fetch seller products - DIRECTLY from Supabase (no API call)
async function fetchSellerProducts(product: MarketplaceProduct): Promise<{ products: MarketplaceProduct[]; seller: SellerInfo | null }> {
  const fastProducts = await fetchSellerProductsFromPublicCards(product);
  if (fastProducts) return fastProducts;

  try {
    const supabase = createPublicSupabaseClient();
    
    if (!product.user_id) return { products: [], seller: null };
    
    // Fetch seller info
    const { data: seller } = await supabase
      .from('users')
      .select('user_id, business_name, logo_url, account_type, seller_display_name, first_name, last_name')
      .eq('user_id', product.user_id)
      .single();
    
    // Fetch seller's other ready products
    const { data: products } = await supabase
      .from('marketplace_ready_products')
      .select(`
        id, description, display_name, price, discount_percent, discount_active, discount_ends_at, sale_price, qoh, model_year, marketplace_category, marketplace_subcategory,
        created_at, user_id,
        resolved_image_id, resolved_image_source, resolved_external_url, resolved_cloudinary_url, resolved_cloudinary_public_id
      `)
      .eq('user_id', product.user_id)
      .neq('id', product.id)
      .is('sold_at', null)
      .order('created_at', { ascending: false })
      .limit(12);

    const sellerInfo = seller ? {
      id: seller.user_id,
      name: seller.seller_display_name || seller.business_name || 
            (seller.first_name && seller.last_name ? `${seller.first_name} ${seller.last_name}`.trim() : 'Unknown Seller'),
      logo_url: seller.logo_url || null,
      account_type: seller.account_type || null,
    } : null;
    
    const formattedProducts = (products || []).map((p: any) => {
      const effectivePid = toCurrentHeroPublicId(
        p.resolved_cloudinary_public_id,
        p.resolved_image_source
      );
      const resolved = resolveProductImage({
        id: p.resolved_image_id,
        cloudinary_public_id: effectivePid,
        cloudinary_url: p.resolved_cloudinary_url,
        external_url: p.resolved_external_url,
        approval_status: 'approved',
      });
      const imageUrl = resolved?.card_url || resolved?.original_url || null;

      return {
        id: p.id,
        description: p.description,
        display_name: p.display_name,
        price: p.price,
        discount_percent: p.discount_percent,
        discount_active: p.discount_active,
        discount_ends_at: p.discount_ends_at,
        sale_price: p.sale_price,
        marketplace_category: p.marketplace_category,
        marketplace_subcategory: p.marketplace_subcategory,
        qoh: p.qoh || 1,
        model_year: p.model_year || null,
        created_at: p.created_at,
        user_id: p.user_id,
        primary_image_url: imageUrl,
        card_url: imageUrl,
        cloudinary_public_id: effectivePid,
        thumbnail_url: resolved?.thumbnail_url || imageUrl,
        detail_url: resolved?.detail_url || resolved?.gallery_url || imageUrl,
        store_name: sellerInfo?.name || 'Unknown Seller',
        store_logo_url: sellerInfo?.logo_url || null,
        store_account_type: sellerInfo?.account_type || null,
      } as MarketplaceProduct;
    });
    
    return {
      products: formattedProducts,
      seller: sellerInfo
    };
  } catch (error) {
    console.error('Error fetching seller products:', error);
    return { products: [], seller: null };
  }
}

const fetchProductPageData = unstable_cache(
  async (productId: string, allowSoldProducts: boolean) => {
    const product = await fetchProduct(productId, allowSoldProducts);
    if (!product) return null;

    const productBrand = product.brand?.trim() || null;
    const [similarProducts, sellerData, brandProducts] = await Promise.all([
      fetchSimilarProductsFromPublicCards(product).then((fastProducts) =>
        fastProducts ?? fetchSimilarProductsFallback(product)
      ),
      fetchSellerProducts(product),
      productBrand ? fetchBrandProducts(productId, productBrand) : Promise.resolve([]),
    ]);

    return {
      product,
      similarProducts,
      sellerData,
      brandProducts,
      productBrand,
    };
  },
  ['marketplace-product-page-data-v1'],
  {
    revalidate: 60,
  },
);

export default async function ProductPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ fromPurchase?: string; fromUpload?: string }>;
}) {
  const { productId } = await params;
  const { fromPurchase, fromUpload } = await searchParams;
  
  // Allow viewing sold products if coming from purchase history
  const allowSoldProducts = fromPurchase === 'true';

  const data = await fetchProductPageData(productId, allowSoldProducts);

  // If product not found, show 404
  if (!data) {
    notFound();
  }

  // Pass all data to client component
  return (
    <ProductPageClient
      product={data.product}
      similarProducts={data.similarProducts}
      sellerProducts={data.sellerData.products}
      sellerInfo={data.sellerData.seller}
      brandProducts={data.brandProducts}
      brandName={data.productBrand ?? null}
      showUploadBanner={fromUpload === 'true'}
    />
  );
}
