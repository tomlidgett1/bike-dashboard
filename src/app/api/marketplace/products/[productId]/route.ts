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
      // Try to fetch as private listing
      const { data: listingProduct, error: listingError } = await supabase
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
          users!inner (
            store_name,
            store_logo_url
          )
        `)
        .eq('id', productId)
        .eq('listing_status', 'active')
        .eq('listing_type', 'private_listing')
        .single();

      if (listingError || !listingProduct) {
        console.error(`❌ Product not found: ${productId}`, productError || listingError);
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }

      // Fetch images for private listing
      const { data: images } = await supabase
        .from('product_images')
        .select('url, isPrimary, order')
        .eq('productId', productId)
        .order('order', { ascending: true });

      // Format the response
      const user = (listingProduct.users as any);
      const formattedProduct: MarketplaceProduct = {
        ...listingProduct,
        store_name: user?.business_name || 'Unknown Seller',
        store_logo_url: user?.logo_url || null,
        store_account_type: user?.account_type || null,
        primary_image_url: images?.find(img => img.isPrimary)?.url || images?.[0]?.url || null,
        images: images || [],
      };

      const loadTime = Date.now() - startTime;
      console.log(`✅ [PRODUCT API] Private listing loaded in ${loadTime}ms`);

      return NextResponse.json({ product: formattedProduct });
    }

    // Format the response for store inventory
    const canonicalProduct = (product.canonical_products as any);
    const productImages = canonicalProduct?.product_images || [];
    const user = (product.users as any);
    
    // Build image URLs
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    let primaryImageUrl = null;
    let allImages: string[] = [];
    
    // Priority 1: Manually uploaded images (stored in images JSONB field)
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const manualImages = product.images as Array<{ url: string; isPrimary?: boolean; order?: number }>;
      // Find primary image or use first one
      const primaryManualImage = manualImages.find(img => img.isPrimary) || manualImages[0];
      primaryImageUrl = primaryManualImage?.url;
      
      // Get all images sorted by order
      allImages = manualImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(img => img.url)
        .filter(url => url && !url.startsWith('blob:'));
      
      console.log(`📸 [PRODUCT API] Using manually uploaded images: ${allImages.length} images`);
    }
    // Priority 2: Custom store image
    else if (product.use_custom_image && product.custom_image_url) {
      primaryImageUrl = product.custom_image_url;
      allImages = [product.custom_image_url];
    }
    // Priority 3: Canonical product images (only approved AND downloaded ones)
    else if (productImages.length > 0) {
      // Already filtered for approved & downloaded in query
      const primaryImage = productImages.find((img: any) => img.is_primary) || productImages[0];
      primaryImageUrl = primaryImage ? `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.storage_path}` : null;
      allImages = productImages.map((img: any) => 
        `${baseUrl}/storage/v1/object/public/product-images/${img.storage_path}`
      );
      console.log(`🖼️ [PRODUCT API] Using ${productImages.length} approved & downloaded canonical images`);
    }
    // Priority 4: Use placeholder if no images available
    else {
      primaryImageUrl = '/placeholder-product.svg';
      allImages = ['/placeholder-product.svg'];
      console.log(`🖼️ [PRODUCT API] Using placeholder for product ${productId}`);
    }
    
    const primaryImage = productImages.find((img: any) => img.is_primary) || productImages[0];
    
    const formattedProduct: MarketplaceProduct = {
      ...product,
      primary_image_url: primaryImageUrl,
      all_images: allImages,
      image_variants: primaryImage?.variants || null,
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

