import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addProductImages } from "@/lib/services/product-images";

// Helper function to find or create canonical product with AI categorisation
async function ensureCanonicalProduct(
  supabase: any,
  productData: {
    description: string;
    upc?: string | null;
    brand?: string | null;
    manufacturer?: string | null;
  }
): Promise<{ canonical_product_id: string; categories?: any }> {
  const normalizedName = productData.description
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ');
  
  const normalizedUpc = productData.upc?.trim().toUpperCase().replace(/\s+/g, '') || null;
  
  // Try to find existing canonical product
  let query = supabase.from('canonical_products').select('id, marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name');
  
  if (normalizedUpc) {
    query = query.eq('upc', normalizedUpc);
  } else {
    query = query.eq('normalized_name', normalizedName);
  }
  
  const { data: existing } = await query.maybeSingle();
  
  if (existing) {
    return {
      canonical_product_id: existing.id,
      categories: existing.marketplace_category ? {
        marketplace_category: existing.marketplace_category,
        marketplace_subcategory: existing.marketplace_subcategory,
        marketplace_level_3_category: existing.marketplace_level_3_category,
        display_name: existing.display_name,
      } : undefined,
    };
  }
  
  // Create new canonical product
  const { data: newCanonical, error } = await supabase
    .from('canonical_products')
    .insert({
      upc: normalizedUpc,
      normalized_name: normalizedName,
      manufacturer: productData.manufacturer || productData.brand || null,
      cleaned: false,
    })
    .select('id')
    .single();
  
  if (error) {
    throw new Error(`Failed to create canonical product: ${error.message}`);
  }
  
  // Note: AI categorisation will be triggered by the categorise-canonical-products function
  // or can be done on-demand. For now, the product will be inserted without categories
  // and the database trigger will handle copying once categories are set.
  
  return { canonical_product_id: newCanonical.id };
}

// ============================================================
// POST /api/marketplace/listings
// Create a new listing
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // ============================================================
    // Ensure Canonical Product exists
    // ============================================================
    let canonical_product_id = body.canonical_product_id;
    
    if (!canonical_product_id) {
      // Create canonical product if not provided
      const canonicalResult = await ensureCanonicalProduct(supabase, {
        description: body.title || body.description || "Untitled Product",
        upc: body.upc,
        brand: body.brand,
        manufacturer: body.manufacturer,
      });
      canonical_product_id = canonicalResult.canonical_product_id;
    }

    // ============================================================
    // Compute primary image URL from images array (server-side truth)
    // ============================================================
    // We do NOT trust body.primaryImageUrl because several client flows can
    // accidentally leave it stale even when images/isPrimary/order are correct.
    const bodyImages = Array.isArray(body.images) ? body.images : [];
    const primaryFromImages =
      bodyImages.find((img: any) => img?.isPrimary === true) ??
      bodyImages.find((img: any) => img?.order === 0) ??
      bodyImages[0];

    const computedPrimaryImageUrl: string | undefined =
      primaryFromImages?.cardUrl || primaryFromImages?.url || body.primaryImageUrl;

    // Map form data to database schema
    // Note: Categories will be copied from canonical_products via database trigger
    const listingData = {
      user_id: user.id,
      listing_type: "private_listing",
      listing_source: body.facebook_source_url ? "facebook_import" : "manual",
      listing_status: body.listingStatus || "draft",
      facebook_source_url: body.facebook_source_url,
      canonical_product_id: canonical_product_id, // Link to canonical product

      // Basic info
      description: body.title || "", // description field is the display name/title
      brand: body.brand,
      model: body.model,
      model_year: body.modelYear,
      price: body.price,
      // Categories will be auto-populated from canonical_products via trigger
      // But we can set them explicitly if provided (they'll be overwritten by trigger if canonical has categories)
      marketplace_category: body.marketplace_category,
      marketplace_subcategory: body.marketplace_subcategory,

      // Bike fields
      frame_size: body.frameSize,
      frame_material: body.frameMaterial,
      bike_type: body.bikeType,
      groupset: body.groupset,
      wheel_size: body.wheelSize,
      suspension_type: body.suspensionType,
      bike_weight: body.bikeWeight,
      color_primary: body.colorPrimary,
      color_secondary: body.colorSecondary,

      // Part fields
      part_type_detail: body.partTypeDetail,
      compatibility_notes: body.compatibilityNotes,
      material: body.material,
      weight: body.weight,

      // Apparel fields
      size: body.size,
      gender_fit: body.genderFit,
      apparel_material: body.apparelMaterial,

      // Condition and descriptions
      product_description: body.productDescription || null,
      condition_rating: body.conditionRating,
      condition_details: body.conditionDetails,
      seller_notes: body.sellerNotes,
      wear_notes: body.wearNotes,
      usage_estimate: body.usageEstimate,
      purchase_location: body.purchaseLocation,
      purchase_date: body.purchaseDate,
      service_history: body.serviceHistory || [],
      upgrades_modifications: body.upgradesModifications,

      // Selling details
      reason_for_selling: body.reasonForSelling,
      is_negotiable: body.isNegotiable || false,
      shipping_available: body.shippingAvailable || false,
      shipping_cost: body.shippingCost,
      pickup_location: body.pickupLocation,
      pickup_only: body.pickupOnly || false,
      included_accessories: body.includedAccessories,

      // Contact
      seller_contact_preference: body.sellerContactPreference || "message",
      seller_phone: body.sellerPhone,
      seller_email: body.sellerEmail,

      // Legacy: Keep images in JSONB for backwards compatibility during transition
      // The database trigger will read from product_images first, then fall back to this
      // SAFEGUARD: Ensure isPrimary is correctly set based on order field before storing
      images: (body.images || []).map((img: any) => ({
        ...img,
        isPrimary: img.order === 0,  // Image with order=0 is primary
      })),
      primary_image_url: computedPrimaryImageUrl,

      // Dates
      published_at: body.publishedAt,
      expires_at: body.expiresAt,

      // System fields
      qoh: 1,
      is_active: body.listingStatus === "active",
      system_sku: `LISTING-${Date.now()}`,
      lightspeed_item_id: `manual-${Date.now()}`,

      // Smart Upload Metadata (from AI analysis + web search)
      smart_upload_metadata: body.structuredMetadata || {},
      web_search_sources: body.searchUrls || [],
      ai_confidence_scores: body.fieldConfidence || {},
    };

    // DEBUG: Detailed logging for image debugging
    console.log('🔍 [LISTINGS API] ====== RECEIVED REQUEST ======');
    console.log('🔍 [LISTINGS API] Images count:', body.images?.length);
    body.images?.forEach((img: any, i: number) => {
      console.log(`🔍 [LISTINGS API] body.images[${i}]:`, {
        id: img.id,
        order: img.order,
        isPrimary: img.isPrimary,
        'typeof isPrimary': typeof img.isPrimary,
        cardUrl: img.cardUrl?.substring(70, 130),
      });
    });
    
    // Check for primary image explicitly
    const primaryImagesInBody = body.images?.filter((img: any) => img.isPrimary === true) || [];
    console.log('🔍 [LISTINGS API] PRIMARY COUNT IN BODY:', primaryImagesInBody.length);
    if (primaryImagesInBody.length > 0) {
      console.log('🔍 [LISTINGS API] Primary image in body:', {
        id: primaryImagesInBody[0].id,
        order: primaryImagesInBody[0].order,
        cardUrl: primaryImagesInBody[0].cardUrl?.substring(70, 130),
      });
    }
    
    console.log('🔍 [LISTINGS API] body.primaryImageUrl:', body.primaryImageUrl?.substring(70, 130));
    console.log('🔍 [LISTINGS API] computedPrimaryImageUrl:', computedPrimaryImageUrl?.substring(70, 130));
    console.log('🔍 [LISTINGS API] listingData.primary_image_url:', listingData.primary_image_url?.substring(70, 130));

    const { data: listing, error } = await supabase
      .from("products")
      .insert(listingData)
      .select()
      .single();

    if (error) {
      console.error("Error creating listing:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ============================================================
    // VERIFICATION: Check what was stored in the products JSONB images column
    // ============================================================
    console.log('🔍 [LISTINGS API] ====== JSONB VERIFICATION ======');
    console.log('🔍 [LISTINGS API] listing.id:', listing?.id);
    console.log('🔍 [LISTINGS API] listing.cached_image_url:', listing?.cached_image_url?.substring(70, 130));
    console.log('🔍 [LISTINGS API] listing.images count:', listing?.images?.length);
    listing?.images?.forEach((img: any, idx: number) => {
      console.log(`🔍 [LISTINGS API] STORED JSONB images[${idx}]:`, {
        id: img.id,
        order: img.order,
        isPrimary: img.isPrimary,
        'typeof isPrimary': typeof img.isPrimary,
        cardUrl: img.cardUrl?.substring(70, 130),
      });
    });
    
    // Check if the cached_image_url matches the expected primary image
    const expectedPrimaryFromJsonb = listing?.images?.find((img: any) => img.isPrimary === true);
    console.log('🔍 [LISTINGS API] Expected primary from JSONB:', expectedPrimaryFromJsonb ? {
      cardUrl: expectedPrimaryFromJsonb.cardUrl?.substring(70, 130),
      isPrimary: expectedPrimaryFromJsonb.isPrimary,
    } : 'NONE FOUND');
    
    const cachedMatchesPrimary = expectedPrimaryFromJsonb?.cardUrl === listing?.cached_image_url;
    console.log('🔍 [LISTINGS API] cached_image_url matches primary cardUrl:', cachedMatchesPrimary);

    // ============================================================
    // Insert images into product_images table (single source of truth)
    // ============================================================
    const images = body.images || [];
    console.log('📸 [LISTINGS API] ====== IMAGE INSERTION DEBUG ======');
    console.log('📸 [LISTINGS API] body.images exists:', !!body.images);
    console.log('📸 [LISTINGS API] images count:', images.length);
    console.log('📸 [LISTINGS API] listing.id:', listing?.id);
    
    // Log each incoming image with all relevant fields
    images.forEach((img: any, idx: number) => {
      console.log(`📸 [LISTINGS API] INCOMING images[${idx}]:`, {
        id: img.id,
        order: img.order,
        isPrimary: img.isPrimary,
        'typeof isPrimary': typeof img.isPrimary,
        url: img.url?.substring(0, 60),
        cardUrl: img.cardUrl?.substring(0, 60),
      });
    });
    
    // ============================================================
    // REFACTORED: Use shared helper to insert images into product_images
    // This is now the ONLY place images are stored (single source of truth)
    // ============================================================
    console.log(`📸 [LISTINGS API] ====== IMAGE INSERTION CHECK ======`);
    console.log(`📸 [LISTINGS API] images.length: ${images.length}`);
    console.log(`📸 [LISTINGS API] listing?.id: ${listing?.id}`);
    console.log(`📸 [LISTINGS API] listing?.canonical_product_id: ${listing?.canonical_product_id}`);
    
    if (images.length > 0 && listing?.id) {
      console.log(`📸 [LISTINGS API] ✅ CONDITION MET - Inserting ${images.length} images via shared helper`);
      
      // Convert to format expected by addProductImages
      const imageData = images.map((img: any, index: number) => {
        const sortOrder = img.order ?? index;
        return {
          cloudinaryResult: {
            url: img.url,
            cardUrl: img.cardUrl,
            mobileCardUrl: img.mobileCardUrl,
            thumbnailUrl: img.thumbnailUrl,
            galleryUrl: img.galleryUrl,
            detailUrl: img.detailUrl || img.url,
          },
          isPrimary: sortOrder === 0, // order=0 is always primary
          sortOrder: sortOrder,
          source: 'listing_upload',
        };
      });
      
      const insertedImages = await addProductImages(
        supabase, 
        listing.id, 
        imageData,
        listing.canonical_product_id
      );
      
      console.log(`✅ [LISTINGS API] ${insertedImages.length} images inserted via shared helper`);
    } else {
      console.log('⚠️ [LISTINGS API] Skipping image insertion - no images or no listing ID');
    }

    // ============================================================
    // Check if a voucher was awarded (first upload bonus)
    // The database trigger creates the voucher automatically
    // ============================================================
    let awardedVoucher = null;
    try {
      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .select('id, voucher_type, amount_cents, min_purchase_cents, description, created_at')
        .eq('user_id', user.id)
        .eq('voucher_type', 'first_upload')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!voucherError && voucher) {
        // Check if this voucher was just created (within last 5 seconds)
        const voucherCreatedAt = new Date(voucher.created_at);
        const now = new Date();
        const timeDiff = now.getTime() - voucherCreatedAt.getTime();
        
        if (timeDiff < 5000) { // Created within last 5 seconds
          awardedVoucher = {
            id: voucher.id,
            type: voucher.voucher_type,
            amount: voucher.amount_cents / 100, // Convert to dollars
            minPurchase: voucher.min_purchase_cents / 100,
            description: voucher.description,
          };
          console.log('🎉 [LISTINGS API] First upload voucher awarded:', awardedVoucher);
        }
      }
    } catch (voucherCheckError) {
      console.error('[LISTINGS API] Error checking for awarded voucher:', voucherCheckError);
      // Don't fail the request if voucher check fails
    }

    return NextResponse.json({ 
      listing,
      awardedVoucher, // Include voucher info if one was just awarded
    }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/marketplace/listings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// GET /api/marketplace/listings
// Get user's listings (all statuses)
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("products")
      .select("*")
      .eq("user_id", user.id)
      .in("listing_source", ["manual", "facebook_import"])
      .order("created_at", { ascending: false });

    if (status) {
      if (status === 'sold') {
        // Sold items have sold_at set
        query = query.not('sold_at', 'is', null);
      } else if (status === 'active') {
        // Active items: not sold and not archived
        query = query.is('sold_at', null).neq('listing_status', 'archived');
      } else if (status === 'archived') {
        query = query.eq("listing_status", 'archived');
      } else {
        query = query.eq("listing_status", status);
      }
    }

    const { data: listings, error } = await query;

    if (error) {
      console.error("Error fetching listings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ listings });
  } catch (error) {
    console.error("Error in GET /api/marketplace/listings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

