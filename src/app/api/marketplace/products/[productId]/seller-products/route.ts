import { NextRequest, NextResponse } from 'next/server';
import type { MarketplaceProduct } from '@/lib/types/marketplace';
import { resolveProductImage, pickPrimaryImage } from '@/lib/services/image-resolver';
import { extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms';
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed';

// ============================================================
// Seller Products API
// Fetch other products from the same seller
// ============================================================

export const revalidate = 60;

function cacheHeaders(startTime: number, feed: string = 'fallback') {
  return {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    'CDN-Cache-Control': 'public, s-maxage=60',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=60',
    'Vary': 'Accept-Encoding',
    'X-Response-Time': `${Date.now() - startTime}ms`,
    'X-Marketplace-Feed': feed,
  };
}

async function tryGetSellerProductsFromPublicCards(productId: string, limit: number, startTime: number) {
  const supabase = createPublicSupabaseClient();

  const { data: sourceRow, error: sourceError } = await supabase
    .from('public_marketplace_cards')
    .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
    .eq('id', productId)
    .maybeSingle();

  if (hasMissingPublicCardFeedError(sourceError)) return null;
  if (sourceError || !sourceRow) return null;

  const source = sourceRow as PublicMarketplaceCardRow;
  if (!source.user_id) {
    return NextResponse.json(
      { products: [], count: 0, seller: null },
      { headers: cacheHeaders(startTime, 'public-cards') },
    );
  }

  const { data: rows, error } = await supabase
    .from('public_marketplace_cards')
    .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
    .eq('user_id', source.user_id)
    .neq('id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (hasMissingPublicCardFeedError(error)) return null;
  if (error) {
    console.warn('[SELLER PRODUCTS API] Public-card fast path failed:', error.message);
    return null;
  }

  const products = ((rows || []) as PublicMarketplaceCardRow[]).map(transformPublicMarketplaceCard);
  const sellerName = source.store_name ||
    (source.first_name && source.last_name ? `${source.first_name} ${source.last_name}`.trim() : null) ||
    'Unknown Seller';

  return NextResponse.json(
    {
      products,
      count: products.length,
      seller: {
        id: source.user_id,
        name: sellerName,
        logo_url: source.store_logo_url || null,
        account_type: source.store_account_type || null,
      },
    },
    { headers: cacheHeaders(startTime, 'public-cards') },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { productId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '12'), 24);

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    console.log(`🏪 [SELLER PRODUCTS API] Fetching seller products for: ${productId}`);

    const fastResponse = await tryGetSellerProductsFromPublicCards(productId, limit, startTime);
    if (fastResponse) return fastResponse;

    const supabase = createPublicSupabaseClient();

    // First, get the seller ID from the source product
    const { data: sourceProduct, error: sourceError } = await supabase
      .from('products')
      .select('user_id')
      .eq('id', productId)
      .single();

    if (sourceError || !sourceProduct) {
      console.error(`❌ [SELLER PRODUCTS API] Source product not found: ${productId}`);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    const sellerId = sourceProduct.user_id;

    // Fetch seller info
    const { data: seller, error: sellerError } = await supabase
      .from('users')
      .select(`
        user_id,
        business_name,
        seller_display_name,
        first_name,
        last_name,
        logo_url,
        account_type
      `)
      .eq('user_id', sellerId)
      .single();

    // Fetch other products from this seller (fetch more to allow for filtering)
    const { data: products, error: productsError } = await supabase
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
        model_year,
        created_at,
        user_id,
        primary_image_url,
        images,
        listing_type,
        listing_status,
        condition_rating,
        users!user_id (
          business_name,
          logo_url,
          account_type
        ),
        canonical_products!canonical_product_id (
          id,
          product_images!canonical_product_id (
            is_primary,
            sort_order,
            approval_status,
            cloudinary_public_id,
            cloudinary_url,
            external_url
          )
        )
      `)
      .eq('user_id', sellerId)
      .eq('is_active', true)
      .neq('id', productId) // Exclude the current product
      .or('listing_status.is.null,listing_status.eq.active')
      .is('sold_at', null) // Only unsold products
      .order('created_at', { ascending: false })
      .limit(50); // Fetch more to allow for filtering

    if (productsError) {
      console.error(`❌ [SELLER PRODUCTS API] Error fetching products:`, productsError);
      return NextResponse.json(
        { error: 'Failed to fetch seller products' },
        { status: 500 }
      );
    }

    // Filter to only include products with Cloudinary images
    const productsWithImages = (products || []).filter(product => {
      // Check 1: Private listings with images array containing cloudinaryUrl/cardUrl
      if (product.images && Array.isArray(product.images) && product.images.length > 0) {
        const hasCloudinaryImage = product.images.some((img: any) => 
          img.cloudinaryUrl || img.cardUrl
        );
        if (hasCloudinaryImage) return true;
      }
      
      // Check 2: Canonical products with an approved image (public_id/url/external)
      const canonicalProduct = product.canonical_products as any;
      const productImages = canonicalProduct?.product_images || [];
      if (productImages.length > 0) {
        const hasImage = productImages.some((img: any) =>
          (img.approval_status == null || img.approval_status === 'approved') &&
          (img.cloudinary_public_id || img.cloudinary_url || img.external_url)
        );
        if (hasImage) return true;
      }

      return false;
    }).slice(0, limit); // Apply the limit after filtering

    if (productsWithImages.length === 0) {
      console.log(`ℹ️ [SELLER PRODUCTS API] No products with images from seller: ${sellerId}`);
      return NextResponse.json({ 
        products: [],
        count: 0,
        seller: null,
      }, {
        headers: cacheHeaders(startTime),
      });
    }

    // Format products for response — resolve every image from the single
    // source of truth (cloudinary_public_id) via the shared resolver.
    const formattedProducts: MarketplaceProduct[] = productsWithImages.map(product => {
      const user = product.users as any;
      const canonicalProduct = product.canonical_products as any;
      const productImages = canonicalProduct?.product_images || [];

      let publicId: string | null = null;
      let externalUrl: string | null = null;
      if (Array.isArray(product.images) && product.images.length > 0) {
        const primary = product.images.find((img: any) => img.isPrimary) || product.images[0];
        publicId = extractCloudinaryPublicId(primary?.cloudinaryUrl || primary?.url);
        externalUrl = primary?.url || null;
      } else {
        const primary = pickPrimaryImage(productImages);
        publicId = primary?.cloudinary_public_id || extractCloudinaryPublicId(primary?.cloudinary_url);
        externalUrl = primary?.external_url || primary?.cloudinary_url || null;
      }

      const resolved = resolveProductImage({
        cloudinary_public_id: publicId,
        external_url: externalUrl,
        approval_status: 'approved',
      });
      const primaryImageUrl = resolved?.card_url || resolved?.original_url || null;

      return {
        id: product.id,
        description: product.description,
        display_name: product.display_name,
        price: product.price,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        marketplace_level_3_category: product.marketplace_level_3_category,
        qoh: product.qoh,
        model_year: product.model_year,
        created_at: product.created_at,
        user_id: product.user_id,
        primary_image_url: primaryImageUrl,
        cloudinary_public_id: publicId,
        card_url: primaryImageUrl,
        thumbnail_url: resolved?.thumbnail_url || primaryImageUrl,
        images: product.images,
        listing_type: product.listing_type,
        listing_status: product.listing_status,
        condition_rating: product.condition_rating,
        store_name: user?.business_name || 'Unknown Seller',
        store_logo_url: user?.logo_url || null,
        store_account_type: user?.account_type || null,
      };
    });

    // Build seller display name
    const sellerDisplayName = seller?.seller_display_name 
      || seller?.business_name 
      || (seller?.first_name && seller?.last_name 
          ? `${seller.first_name} ${seller.last_name}`.trim() 
          : null)
      || 'Unknown Seller';

    const loadTime = Date.now() - startTime;
    console.log(`✅ [SELLER PRODUCTS API] Found ${formattedProducts.length} products from seller in ${loadTime}ms`);

    return NextResponse.json(
      { 
        products: formattedProducts,
        count: formattedProducts.length,
        seller: {
          id: sellerId,
          name: sellerDisplayName,
          logo_url: seller?.logo_url || null,
          account_type: seller?.account_type || null,
        },
      },
      {
        headers: cacheHeaders(startTime),
      }
    );

  } catch (error) {
    console.error('❌ [SELLER PRODUCTS API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
