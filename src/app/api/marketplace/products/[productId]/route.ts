import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MarketplaceProduct } from '@/lib/types/marketplace';

// ============================================================
// Individual Product API - Public Endpoint
// Fetch a single product by ID
// ============================================================

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { productId } = await params;

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    console.log(`📦 [PRODUCT API] Fetching product: ${productId}`);

    // Create Supabase client (public access, no auth required)
    const supabase = await createClient();

    // Fetch product with all related data
    const { data: product, error: productError } = await supabase
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
        canonical_product_id,
        use_custom_image,
        custom_image_url,
        images,
        listing_type,
        listing_source,
        listing_status,
        published_at,
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
        users!user_id (
          business_name,
          logo_url,
          account_type
        ),
        canonical_products!canonical_product_id (
          id,
          product_images!canonical_product_id (
            storage_path,
            is_primary,
            variants,
            approval_status,
            is_downloaded
          )
        )
      `)
      .eq('id', productId)
      .or('listing_status.is.null,listing_status.eq.active')
      .single();

    if (productError || !product) {
      console.error(`❌ Product not found: ${productId}`, productError);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // ============================================================
    // Fetch images from product_images table (single source of truth)
    // This works for both private listings and canonical products
    // ============================================================
    const { data: productImagesFromTable } = await supabase
      .from('product_images')
      .select(`
        id,
        cloudinary_url,
        card_url,
        thumbnail_url,
        detail_url,
        external_url,
        is_primary,
        sort_order,
        approval_status
      `)
      .eq('product_id', productId)
      .eq('approval_status', 'approved')
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true });

    // If no images found by product_id, check canonical_product_id
    let allProductImages = productImagesFromTable || [];
    if (allProductImages.length === 0 && product.canonical_product_id) {
      const { data: canonicalImages } = await supabase
        .from('product_images')
        .select(`
          id,
          cloudinary_url,
          card_url,
          thumbnail_url,
          detail_url,
          external_url,
          is_primary,
          sort_order,
          approval_status
        `)
        .eq('canonical_product_id', product.canonical_product_id)
        .eq('approval_status', 'approved')
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true });
      
      allProductImages = canonicalImages || [];
    }

    // Format the response
    const user = (product.users as any);
    
    // Build image URLs from product_images table (single source of truth)
    let primaryImageUrl: string | null = null;
    let allImages: string[] = [];
    
    // Priority 1: Images from product_images table
    if (allProductImages.length > 0) {
      const primaryImage = allProductImages.find((img: any) => img.is_primary) || allProductImages[0];
      // Use detail_url for full resolution, fallback to card_url or cloudinary_url
      primaryImageUrl = primaryImage?.detail_url || primaryImage?.cloudinary_url || primaryImage?.card_url || null;
      
      // Get all images - use detail_url for gallery
      allImages = allProductImages
        .map((img: any) => img.detail_url || img.cloudinary_url || img.card_url)
        .filter((url: string | null) => url && !url.startsWith('blob:'));
      
      console.log(`📸 [PRODUCT API] Using ${allProductImages.length} images from product_images table`);
    }
    // Priority 2: Custom store image (legacy)
    else if (product.use_custom_image && product.custom_image_url) {
      primaryImageUrl = product.custom_image_url;
      allImages = [product.custom_image_url];
      console.log(`📸 [PRODUCT API] Using custom store image`);
    }
    // Priority 3: Legacy JSONB images (fallback during migration)
    else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const manualImages = product.images as Array<{ url: string; cardUrl?: string; detailUrl?: string; isPrimary?: boolean; order?: number }>;
      const primaryManualImage = manualImages.find(img => img.isPrimary) || manualImages[0];
      primaryImageUrl = primaryManualImage?.detailUrl || primaryManualImage?.url;
      
      allImages = manualImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(img => img.detailUrl || img.url)
        .filter(url => url && !url.startsWith('blob:'));
      
      console.log(`📸 [PRODUCT API] Using legacy JSONB images: ${allImages.length} images`);
    }
    // Priority 4: Use placeholder if no images available
    else {
      primaryImageUrl = '/placeholder-product.svg';
      allImages = ['/placeholder-product.svg'];
      console.log(`🖼️ [PRODUCT API] Using placeholder for product ${productId}`);
    }
    
    const formattedProduct: MarketplaceProduct = {
      ...product,
      primary_image_url: primaryImageUrl,
      all_images: allImages,
      image_variants: null,
      store_name: user?.business_name || 'Unknown Store',
      store_logo_url: user?.logo_url || null,
      store_account_type: user?.account_type || null,
    };

    const loadTime = Date.now() - startTime;
    console.log(`✅ [PRODUCT API] Product loaded in ${loadTime}ms`);

    return NextResponse.json({ product: formattedProduct });

  } catch (error) {
    console.error('❌ [PRODUCT API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

