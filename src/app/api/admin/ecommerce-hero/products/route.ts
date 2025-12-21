/**
 * E-Commerce Hero Products API
 * GET /api/admin/ecommerce-hero/products
 * 
 * Lists products with their images for e-commerce hero processing
 * Supports filtering by listing_type, brand, store, stock status and search
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Use regular client for auth check
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Use service role client to bypass RLS (to see inactive products)
    const supabase = createServiceRoleClient();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const productId = searchParams.get('product_id') || ''; // Direct product ID lookup
    const listingType = searchParams.get('listing_type') || 'all'; // 'private_listing', 'lightspeed', 'all'
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const hasImages = searchParams.get('has_images') === 'true';
    
    // New filters
    const brand = searchParams.get('brand') || '';
    const storeId = searchParams.get('store_id') || '';
    const inStock = searchParams.get('in_stock') === 'true';
    // Hero background filter: 'all', 'optimized', 'not_optimized'
    const heroOptimized = searchParams.get('hero_optimized') || 'all';
    // Admin approved filter: 'all', 'approved', 'not_approved'
    const adminApproved = searchParams.get('admin_approved') || 'all';
    // Active status filter: 'all', 'active', 'inactive'
    const activeStatus = searchParams.get('active_status') || 'all';
    // Secondary review filter: 'all', 'flagged', 'not_flagged'
    const secondaryReview = searchParams.get('secondary_review') || 'all';

    console.log(`[ECOMMERCE-HERO PRODUCTS] Fetching products:`, {
      search,
      productId,
      listingType,
      page,
      limit,
      hasImages,
      brand,
      storeId,
      inStock,
      heroOptimized,
      adminApproved,
      activeStatus,
      secondaryReview,
    });

    // Build query for products
    // Note: We fetch product_images via product_id join, but also need canonical_product_id images
    let query = supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        brand,
        model,
        listing_type,
        is_active,
        cached_image_url,
        cached_thumbnail_url,
        primary_image_url,
        has_displayable_image,
        hero_background_optimized,
        images_approved_by_admin,
        images_approved_at,
        needs_secondary_review,
        secondary_review_flagged_at,
        price,
        qoh,
        images,
        created_at,
        user_id,
        canonical_product_id,
        users!user_id (
          business_name,
          account_type
        ),
        product_images (
          id,
          cloudinary_url,
          card_url,
          thumbnail_url,
          gallery_url,
          detail_url,
          external_url,
          is_primary,
          is_ai_generated,
          sort_order,
          approval_status,
          width,
          height,
          created_at
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply direct product ID filter (for fetching a single product)
    if (productId) {
      query = query.eq('id', productId);
    }

    // Apply listing type filter
    if (listingType === 'private_listing') {
      query = query.eq('listing_type', 'private_listing');
    } else if (listingType === 'lightspeed') {
      query = query.or('listing_type.is.null,listing_type.neq.private_listing');
    }
    // 'all' = no filter

    // Apply brand filter
    if (brand) {
      query = query.eq('brand', brand);
    }

    // Apply store filter
    if (storeId) {
      query = query.eq('user_id', storeId);
    }

    // Apply in-stock filter
    if (inStock) {
      query = query.gt('qoh', 0);
    }

    // Apply hero background optimized filter
    if (heroOptimized === 'optimized') {
      query = query.eq('hero_background_optimized', true);
    } else if (heroOptimized === 'not_optimized') {
      query = query.or('hero_background_optimized.is.null,hero_background_optimized.eq.false');
    }
    // 'all' = no filter

    // Apply admin approved filter
    if (adminApproved === 'approved') {
      query = query.eq('images_approved_by_admin', true);
    } else if (adminApproved === 'not_approved') {
      query = query.or('images_approved_by_admin.is.null,images_approved_by_admin.eq.false');
    }
    // 'all' = no filter

    // Apply active status filter
    if (activeStatus === 'active') {
      query = query.eq('is_active', true);
    } else if (activeStatus === 'inactive') {
      query = query.eq('is_active', false);
    }
    // 'all' = no filter

    // Apply secondary review filter
    if (secondaryReview === 'flagged') {
      query = query.eq('needs_secondary_review', true);
    } else if (secondaryReview === 'not_flagged') {
      query = query.or('needs_secondary_review.is.null,needs_secondary_review.eq.false');
    }
    // 'all' = no filter

    // Apply search filter
    if (search) {
      query = query.or(`description.ilike.%${search}%,display_name.ilike.%${search}%,brand.ilike.%${search}%,model.ilike.%${search}%`);
    }

    // Apply has_images filter if requested
    if (hasImages) {
      query = query.eq('has_displayable_image', true);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: products, error, count } = await query;

    if (error) {
      console.error('[ECOMMERCE-HERO PRODUCTS] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Collect canonical_product_ids to fetch additional images
    const canonicalIds = (products || [])
      .map(p => p.canonical_product_id)
      .filter((id): id is string => !!id);

    // Fetch images linked to canonical_product_id
    let canonicalImagesMap: Map<string, any[]> = new Map();
    if (canonicalIds.length > 0) {
      const { data: canonicalImages } = await supabase
        .from('product_images')
        .select(`
          id,
          canonical_product_id,
          cloudinary_url,
          card_url,
          thumbnail_url,
          gallery_url,
          detail_url,
          external_url,
          is_primary,
          is_ai_generated,
          sort_order,
          approval_status
        `)
        .in('canonical_product_id', canonicalIds);
      
      // Group by canonical_product_id
      for (const img of canonicalImages || []) {
        const key = img.canonical_product_id;
        if (!canonicalImagesMap.has(key)) {
          canonicalImagesMap.set(key, []);
        }
        canonicalImagesMap.get(key)!.push(img);
      }
      console.log(`[ECOMMERCE-HERO PRODUCTS] Fetched ${canonicalImages?.length || 0} canonical images for ${canonicalIds.length} products`);
    }

    // Transform products to include all available image URLs
    const transformedProducts = (products || []).map(product => {
      // Separate images by source for clear management
      interface ImageData {
        id: string;
        url: string;
        cardUrl?: string;
        thumbnailUrl?: string;
        galleryUrl?: string;
        detailUrl?: string;
        isPrimary: boolean;
        isAiGenerated?: boolean;
        sortOrder: number;
        source: 'product_images' | 'jsonb' | 'canonical';
        isInJsonb?: boolean; // True if this image is in the products.images JSONB array
        isOnProductPage?: boolean; // True if this image is visible on the product page (accounts for fallback logic)
      }
      
      // Helper to check if an image URL is visible on the product page
      const isImageVisibleOnPage = (imgUrl: string, cardUrl?: string | null): boolean => {
        // If JSONB has images, only JSONB images are visible
        if (hasJsonbImages) {
          return jsonbUrlsSet.has(imgUrl) || (cardUrl ? jsonbUrlsSet.has(cardUrl) : false);
        }
        // If no JSONB images, fallback to primary_image_url
        if (primaryImageUrl) {
          return imgUrl === primaryImageUrl || cardUrl === primaryImageUrl;
        }
        // No visibility info available
        return false;
      };

      const dbImages: ImageData[] = [];
      const jsonbImages: ImageData[] = [];
      const seenUrls = new Set<string>();
      
      // Collect all URLs from the raw JSONB images array (before deduplication)
      // These are the images that will appear on the product page
      const jsonbUrlsSet = new Set<string>();
      if (product.images && Array.isArray(product.images)) {
        for (const img of product.images) {
          const imgUrl = img.url || img.cardUrl;
          if (imgUrl) {
            jsonbUrlsSet.add(imgUrl);
            // Also add cardUrl if different
            if (img.cardUrl && img.cardUrl !== imgUrl) {
              jsonbUrlsSet.add(img.cardUrl);
            }
          }
        }
      }
      
      // For fallback visibility: if no JSONB images, primary_image_url is shown
      const hasJsonbImages = jsonbUrlsSet.size > 0;
      const primaryImageUrl = product.primary_image_url;

      // Add images from product_images table (linked by product_id)
      if (product.product_images && Array.isArray(product.product_images)) {
        console.log(`[ECOMMERCE-HERO PRODUCTS] Product ${product.id} has ${product.product_images.length} product_images records (by product_id)`);
        for (const img of product.product_images) {
          if (img.cloudinary_url || img.card_url || img.external_url) {
            const url = img.cloudinary_url || img.card_url || img.external_url;
            seenUrls.add(url);
            // Check if this image URL exists in the JSONB array
            const isInJsonb = jsonbUrlsSet.has(url) || (img.card_url && jsonbUrlsSet.has(img.card_url));
            // Check if visible on product page (accounts for fallback when no JSONB)
            const isOnPage = isImageVisibleOnPage(url, img.card_url);
            dbImages.push({
              id: img.id,
              url,
              cardUrl: img.card_url,
              thumbnailUrl: img.thumbnail_url,
              galleryUrl: img.gallery_url,
              detailUrl: img.detail_url,
              isPrimary: img.is_primary || false,
              isAiGenerated: img.is_ai_generated || false,
              sortOrder: img.sort_order ?? 0,
              source: 'product_images',
              isInJsonb: !!isInJsonb,
              isOnProductPage: isOnPage,
            });
          } else {
            console.log(`[ECOMMERCE-HERO PRODUCTS] Skipping product_image ${img.id} - no valid URL`);
          }
        }
      } else {
        console.log(`[ECOMMERCE-HERO PRODUCTS] Product ${product.id} has NO product_images (by product_id)`);
      }

      // Add images from canonical_product_id
      if (product.canonical_product_id && canonicalImagesMap.has(product.canonical_product_id)) {
        const canonicalImages = canonicalImagesMap.get(product.canonical_product_id)!;
        console.log(`[ECOMMERCE-HERO PRODUCTS] Product ${product.id} has ${canonicalImages.length} canonical images`);
        for (const img of canonicalImages) {
          if (img.cloudinary_url || img.card_url || img.external_url) {
            const url = img.cloudinary_url || img.card_url || img.external_url;
            // Skip if we already have this URL
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            // Check if this image URL exists in the JSONB array
            const isInJsonb = jsonbUrlsSet.has(url) || (img.card_url && jsonbUrlsSet.has(img.card_url));
            // Check if visible on product page
            const isOnPage = isImageVisibleOnPage(url, img.card_url);
            dbImages.push({
              id: img.id,
              url,
              cardUrl: img.card_url,
              thumbnailUrl: img.thumbnail_url,
              galleryUrl: img.gallery_url,
              detailUrl: img.detail_url,
              isPrimary: img.is_primary || false,
              isAiGenerated: img.is_ai_generated || false,
              sortOrder: img.sort_order ?? dbImages.length,
              source: 'canonical',
              isInJsonb: !!isInJsonb,
              isOnProductPage: isOnPage,
            });
          }
        }
      }

      // Sort by sort_order
      dbImages.sort((a, b) => a.sortOrder - b.sortOrder);

      // Add images from JSONB images array (for private listings)
      if (product.images && Array.isArray(product.images)) {
        console.log(`[ECOMMERCE-HERO PRODUCTS] Product ${product.id} has ${product.images.length} JSONB images`);
        let jsonbIndex = 0;
        let duplicateCount = 0;
        for (const img of product.images) {
          const imgUrl = img.url || img.cardUrl;
          // Check for duplicates using seenUrls
          if (!imgUrl || seenUrls.has(imgUrl)) {
            if (imgUrl) duplicateCount++;
            continue;
          }
          seenUrls.add(imgUrl);
          jsonbImages.push({
            id: img.id || `jsonb-${jsonbIndex}`,
            url: imgUrl,
            cardUrl: img.cardUrl,
            thumbnailUrl: img.thumbnailUrl,
            galleryUrl: img.galleryUrl,
            detailUrl: img.detailUrl,
            isPrimary: img.isPrimary || false,
            isAiGenerated: false,
            sortOrder: img.order || jsonbIndex,
            source: 'jsonb',
          });
          jsonbIndex++;
        }
        if (duplicateCount > 0) {
          console.log(`[ECOMMERCE-HERO PRODUCTS] Filtered ${duplicateCount} duplicate JSONB images`);
        }
        // Sort by order
        jsonbImages.sort((a, b) => a.sortOrder - b.sortOrder);
      } else {
        console.log(`[ECOMMERCE-HERO PRODUCTS] Product ${product.id} has NO JSONB images`);
      }

      // Combined list for backwards compatibility
      const allImages = [...dbImages, ...jsonbImages];

      // Get store name from users relation
      const userData = product.users as { business_name?: string; account_type?: string } | null;
      const storeName = userData?.business_name || 'Unknown Store';

      return {
        id: product.id,
        name: product.display_name || product.description,
        brand: product.brand,
        model: product.model,
        listingType: product.listing_type,
        isActive: product.is_active !== false,
        cachedImageUrl: product.cached_image_url,
        cachedThumbnailUrl: product.cached_thumbnail_url,
        primaryImageUrl: product.primary_image_url,
        hasJsonbImages: hasJsonbImages,
        hasDisplayableImage: product.has_displayable_image,
        heroBackgroundOptimized: product.hero_background_optimized || false,
        imagesApprovedByAdmin: product.images_approved_by_admin || false,
        imagesApprovedAt: product.images_approved_at,
        needsSecondaryReview: product.needs_secondary_review || false,
        secondaryReviewFlaggedAt: product.secondary_review_flagged_at,
        price: product.price,
        qoh: product.qoh,
        createdAt: product.created_at,
        userId: product.user_id,
        storeName,
        // Separated image sources for management
        dbImages,
        jsonbImages,
        dbImageCount: dbImages.length,
        jsonbImageCount: jsonbImages.length,
        // Combined for backwards compatibility
        images: allImages,
        imageCount: allImages.length,
      };
    });

    return NextResponse.json({
      success: true,
      data: transformedProducts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[ECOMMERCE-HERO PRODUCTS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

