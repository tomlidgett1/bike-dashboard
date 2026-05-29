import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MarketplaceProduct } from '@/lib/types/marketplace';
import { resolveProductImage, pickPrimaryImage } from '@/lib/services/image-resolver';
import { extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms';

// ============================================================
// Similar Products API
// Rule-based similarity matching with weighted scoring
// ============================================================

export const dynamic = 'force-dynamic';

interface ScoredProduct {
  product: any;
  score: number;
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

    console.log(`🔍 [SIMILAR API] Finding similar products for: ${productId}`);

    const supabase = await createClient();

    // First, fetch the source product to get its attributes
    const { data: sourceProduct, error: sourceError } = await supabase
      .from('products')
      .select(`
        id,
        user_id,
        marketplace_category,
        marketplace_subcategory,
        marketplace_level_3_category,
        price,
        bike_type,
        frame_size,
        condition_rating,
        display_name,
        description
      `)
      .eq('id', productId)
      .single();

    if (sourceError || !sourceProduct) {
      console.error(`❌ [SIMILAR API] Source product not found: ${productId}`);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Extract brand from display_name or description (first word often is brand)
    const sourceBrand = extractBrand(sourceProduct.display_name || sourceProduct.description);

    // Build the query for potential similar products
    // We want products that share at least one attribute with the source
    let query = supabase
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
        bike_type,
        frame_size,
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
      .eq('is_active', true)
      .neq('id', productId) // Exclude the source product
      .or('listing_status.is.null,listing_status.eq.active');

    // Filter by category to narrow down candidates
    if (sourceProduct.marketplace_category) {
      query = query.eq('marketplace_category', sourceProduct.marketplace_category);
    }

    // Get more candidates than needed for scoring
    const { data: candidates, error: candidatesError } = await query.limit(150);

    // Filter to only include products with Cloudinary images
    const candidatesWithImages = (candidates || []).filter(product => {
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
    });

    if (candidatesError) {
      console.error(`❌ [SIMILAR API] Error fetching candidates:`, candidatesError);
      return NextResponse.json(
        { error: 'Failed to fetch similar products' },
        { status: 500 }
      );
    }

    if (!candidatesWithImages || candidatesWithImages.length === 0) {
      console.log(`ℹ️ [SIMILAR API] No similar products with images found for: ${productId}`);
      return NextResponse.json({ 
        products: [],
        count: 0 
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // Score each candidate based on similarity
    const scoredProducts: ScoredProduct[] = candidatesWithImages.map(product => {
      let score = 0;

      // Same subcategory: +5 points
      if (sourceProduct.marketplace_subcategory && 
          product.marketplace_subcategory === sourceProduct.marketplace_subcategory) {
        score += 5;
      }

      // Same category: +3 points (already filtered, but for weighting)
      if (sourceProduct.marketplace_category && 
          product.marketplace_category === sourceProduct.marketplace_category) {
        score += 3;
      }

      // Same level 3 category: +4 points
      if (sourceProduct.marketplace_level_3_category && 
          product.marketplace_level_3_category === sourceProduct.marketplace_level_3_category) {
        score += 4;
      }

      // Same bike type (for bicycles): +4 points
      if (sourceProduct.bike_type && 
          product.bike_type === sourceProduct.bike_type) {
        score += 4;
      }

      // Same frame size: +3 points
      if (sourceProduct.frame_size && 
          product.frame_size === sourceProduct.frame_size) {
        score += 3;
      }

      // Similar price (within 30%): +2 points
      if (sourceProduct.price && product.price) {
        const priceDiff = Math.abs(product.price - sourceProduct.price) / sourceProduct.price;
        if (priceDiff <= 0.3) {
          score += 2;
        } else if (priceDiff <= 0.5) {
          score += 1;
        }
      }

      // Same condition rating: +2 points
      if (sourceProduct.condition_rating && 
          product.condition_rating === sourceProduct.condition_rating) {
        score += 2;
      }

      // Same brand (extracted from name): +3 points
      const productBrand = extractBrand(product.display_name || product.description);
      if (sourceBrand && productBrand && 
          sourceBrand.toLowerCase() === productBrand.toLowerCase()) {
        score += 3;
      }

      return { product, score };
    });

    // Sort by score (descending), then by recency
    scoredProducts.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Tie-breaker: newer products first
      return new Date(b.product.created_at).getTime() - new Date(a.product.created_at).getTime();
    });

    // Take top N products with score > 0
    const topProducts = scoredProducts
      .filter(sp => sp.score > 0)
      .slice(0, limit);

    // Format products for response — resolve every image from the single
    // source of truth (cloudinary_public_id) via the shared resolver.
    const formattedProducts: MarketplaceProduct[] = topProducts.map(({ product }) => {
      const user = product.users as any;
      const canonicalProduct = product.canonical_products as any;
      const productImages = canonicalProduct?.product_images || [];

      // Private-listing JSONB images carry a Cloudinary URL we can derive a
      // public_id from; canonical images already expose the column.
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
        store_name: user?.business_name || 'Unknown Seller',
        store_logo_url: user?.logo_url || null,
        store_account_type: user?.account_type || null,
      };
    });

    const loadTime = Date.now() - startTime;
    console.log(`✅ [SIMILAR API] Found ${formattedProducts.length} similar products in ${loadTime}ms`);

    return NextResponse.json(
      { 
        products: formattedProducts,
        count: formattedProducts.length,
        sourceCategory: sourceProduct.marketplace_category,
        sourceSubcategory: sourceProduct.marketplace_subcategory,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );

  } catch (error) {
    console.error('❌ [SIMILAR API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to extract brand from product name
function extractBrand(name: string | null | undefined): string | null {
  if (!name) return null;
  
  // Common bike brands to look for
  const knownBrands = [
    'Specialized', 'Trek', 'Giant', 'Cannondale', 'Scott', 'Bianchi',
    'Cervelo', 'Pinarello', 'Colnago', 'BMC', 'Canyon', 'Orbea',
    'Merida', 'Fuji', 'Felt', 'Kona', 'Santa Cruz', 'Yeti',
    'Norco', 'GT', 'Cube', 'Focus', 'Liv', 'Salsa', 'Surly',
    'All-City', 'Marin', 'Jamis', 'Raleigh', 'Schwinn', 'Diamondback',
    'Shimano', 'SRAM', 'Campagnolo', 'Zipp', 'Enve', 'DT Swiss',
    'Mavic', 'Fulcrum', 'Continental', 'Vittoria', 'Schwalbe',
    'Garmin', 'Wahoo', 'Rapha', 'Castelli', 'Assos', 'Pearl Izumi',
    'Giro', 'POC', 'Oakley', 'Smith', 'Bell', 'Kask', 'MET',
  ];
  
  // Check if name starts with a known brand
  const nameLower = name.toLowerCase();
  for (const brand of knownBrands) {
    if (nameLower.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  
  // Fallback: return first word as potential brand
  const firstWord = name.split(/[\s\-_]/)[0];
  if (firstWord && firstWord.length > 2) {
    return firstWord;
  }
  
  return null;
}

