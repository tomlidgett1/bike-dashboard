import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MarketplaceProduct, MarketplaceProductsResponse } from '@/lib/types/marketplace';

// ============================================================
// Marketplace Products API - Public Endpoint
// Enterprise-grade with caching, pagination, and optimization
// ============================================================

// Force dynamic for development (disable caching while building features)
export const dynamic = 'force-dynamic';
// export const revalidate = 300; // Re-enable ISR caching after development

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract query parameters
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const search = searchParams.get('search');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const sortBy = searchParams.get('sortBy') || 'newest';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '24');

    // Create Supabase client (public access, no auth required)
    const supabase = await createClient();

    // Start building query - join with canonical products, images, and store info
    let query = supabase
      .from('products')
      .select(`
        id,
        description,
        price,
        marketplace_category,
        marketplace_subcategory,
        qoh,
        model_year,
        created_at,
        user_id,
        canonical_product_id,
        use_custom_image,
        custom_image_url,
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
      `, { count: 'exact' })
      .eq('is_active', true)
      .or('listing_status.is.null,listing_status.eq.active');

    // Apply category filter
    if (category) {
      query = query.eq('marketplace_category', category);
    }

    // Apply subcategory filter
    if (subcategory && subcategory !== 'All') {
      query = query.eq('marketplace_subcategory', subcategory);
    }

    // Apply price range filters
    if (minPrice) {
      query = query.gte('price', parseFloat(minPrice));
    }
    if (maxPrice) {
      query = query.lte('price', parseFloat(maxPrice));
    }

    // Apply search filter (full-text search on description)
    if (search && search.trim()) {
      query = query.textSearch('description', search.trim(), {
        type: 'websearch',
        config: 'english',
      });
    }

    // Apply sorting
    switch (sortBy) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      console.error('Marketplace products query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    // Deduplicate the data first (JOIN with product_images can create duplicates)
    const uniqueProductsMap = new Map<string, any>();
    (data || []).forEach((product: any) => {
      if (!uniqueProductsMap.has(product.id)) {
        uniqueProductsMap.set(product.id, product);
      }
    });
    const uniqueData = Array.from(uniqueProductsMap.values());

    console.log(`📊 [MARKETPLACE API] Raw results: ${data?.length || 0}, Unique: ${uniqueData.length}`);

    // Calculate pagination metadata
    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;

    // Transform data to marketplace product format with optimized images
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    const products: MarketplaceProduct[] = uniqueData.map((product: any) => {
      console.log('🖼️ [IMAGE DEBUG] Processing product:', product.id);
      console.log('🖼️ [IMAGE DEBUG] listing_type:', product.listing_type);
      console.log('🖼️ [IMAGE DEBUG] images field:', product.images);
      console.log('🖼️ [IMAGE DEBUG] primary_image_url:', product.primary_image_url);
      
      let primaryImageUrl = null;
      let imageVariants = null;
      let imageFormats = null;
      let allImages: string[] = [];
      
      // Priority 1: Custom store image
      if (product.use_custom_image && product.custom_image_url) {
        primaryImageUrl = product.custom_image_url;
        allImages.push(product.custom_image_url);
      }
      // Priority 2: Canonical product images
      else if (product.canonical_products?.product_images) {
        const images = product.canonical_products.product_images;
        
        // Get primary image first
        const primaryImage = images.find((img: any) => img.is_primary);
        if (primaryImage) {
          primaryImageUrl = `${baseUrl}/storage/v1/object/public/product-images/${primaryImage.storage_path}`;
          imageVariants = primaryImage.variants;
          imageFormats = primaryImage.formats;
        }
        
        // Get ALL images for the gallery (primary first, then others)
        const sortedImages = [...images].sort((a: any, b: any) => {
          if (a.is_primary) return -1;
          if (b.is_primary) return 1;
          return 0;
        });
        
        allImages = sortedImages
          .map((img: any) => {
            // Try to use the 'large' variant if available, otherwise original
            if (img.variants?.large) {
              return `${baseUrl}/storage/v1/object/public/product-images/${img.variants.large}`;
            }
            return `${baseUrl}/storage/v1/object/public/product-images/${img.storage_path}`;
          })
          .filter(Boolean);
      }
      
      return {
        id: product.id,
        description: product.description,
        price: parseFloat(product.price) || 0,
        marketplace_category: product.marketplace_category,
        marketplace_subcategory: product.marketplace_subcategory,
        primary_image_url: primaryImageUrl,
        image_variants: imageVariants,
        image_formats: imageFormats,
        all_images: allImages,
        qoh: product.qoh || 0,
        model_year: product.model_year,
        created_at: product.created_at,
        user_id: product.user_id,
        store_name: product.users?.business_name || 'Bike Store',
        store_logo_url: product.users?.logo_url || null,
        
        // Extended listing fields
        listing_type: product.listing_type,
        listing_source: product.listing_source,
        listing_status: product.listing_status,
        
        // Bike fields
        frame_size: product.frame_size,
        frame_material: product.frame_material,
        bike_type: product.bike_type,
        groupset: product.groupset,
        wheel_size: product.wheel_size,
        suspension_type: product.suspension_type,
        bike_weight: product.bike_weight,
        color_primary: product.color_primary,
        color_secondary: product.color_secondary,
        
        // Part fields
        part_type_detail: product.part_type_detail,
        compatibility_notes: product.compatibility_notes,
        material: product.material,
        weight: product.weight,
        
        // Apparel fields
        size: product.size,
        gender_fit: product.gender_fit,
        apparel_material: product.apparel_material,
        
        // Condition & history
        condition_rating: product.condition_rating,
        condition_details: product.condition_details,
        wear_notes: product.wear_notes,
        usage_estimate: product.usage_estimate,
        purchase_location: product.purchase_location,
        purchase_date: product.purchase_date,
        service_history: product.service_history,
        upgrades_modifications: product.upgrades_modifications,
        
        // Selling details
        reason_for_selling: product.reason_for_selling,
        is_negotiable: product.is_negotiable,
        shipping_available: product.shipping_available,
        shipping_cost: product.shipping_cost,
        pickup_location: product.pickup_location,
        included_accessories: product.included_accessories,
        
        // Contact
        seller_contact_preference: product.seller_contact_preference,
        seller_phone: product.seller_phone,
        seller_email: product.seller_email,
        
        // Dates
        published_at: product.published_at,
        expires_at: product.expires_at,
        
        // Raw images field (for listings)
        images: product.images,
      } as MarketplaceProduct;
    });

    const response: MarketplaceProductsResponse = {
      products,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore,
      },
    };

    // Set aggressive caching headers for enterprise performance
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
        'Vary': 'Accept-Encoding',
      },
    });
  } catch (error) {
    console.error('Unexpected error in marketplace products API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

