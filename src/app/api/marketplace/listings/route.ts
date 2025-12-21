import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    
    if (images.length > 0 && listing?.id) {
      console.log(`📸 [LISTINGS API] Inserting ${images.length} images into product_images table`);
      
      // Use order field as the source of truth for is_primary
      // The image with order=0 is ALWAYS the primary image
      const imageRecords = images.map((img: any, index: number) => {
        // Use order field to determine primary - order=0 is primary
        const sortOrder = img.order ?? index;
        const finalIsPrimary = sortOrder === 0;
        
        console.log(`📸 [LISTINGS API] Building record[${index}]:`, {
          'img.order': img.order,
          'sortOrder': sortOrder,
          'finalIsPrimary (order===0)': finalIsPrimary,
          'img.isPrimary (original)': img.isPrimary,
        });
        
        return {
          product_id: listing.id,
          cloudinary_url: img.url,
          card_url: img.cardUrl,
          thumbnail_url: img.thumbnailUrl,
          detail_url: img.detailUrl || img.url,
          external_url: img.url,
          is_primary: finalIsPrimary,
          // IMPORTANT: Use ?? so order=0 doesn't get treated as falsy and replaced.
          sort_order: img.order ?? index,
          is_downloaded: true,
          approval_status: 'approved',
          uploaded_by: user.id,
          width: img.width || 800,
          height: img.height || 800,
          mime_type: 'image/webp',
        };
      });
      
      console.log('🖼️ [LISTINGS API] ====== FINAL IMAGE RECORDS ======');
      imageRecords.forEach((r: any, idx: number) => {
        console.log(`🖼️ [LISTINGS API] record[${idx}]:`, {
          is_primary: r.is_primary,
          sort_order: r.sort_order,
          card_url: r.card_url?.substring(60, 120),
        });
      });

      const { data: insertedImages, error: imageError } = await supabase
        .from("product_images")
        .insert(imageRecords)
        .select('id, is_primary, sort_order, card_url');

      if (imageError) {
        console.error("❌ [LISTINGS API] Error inserting images:", imageError);
        // Don't fail the whole request, images are stored in JSONB as backup
      } else {
        console.log(`✅ [LISTINGS API] ${images.length} images inserted into product_images table`);
        console.log('✅ [LISTINGS API] Inserted records:', JSON.stringify(insertedImages, null, 2));
        
        // VERIFICATION: Query the database to confirm is_primary values
        const { data: verifyImages, error: verifyError } = await supabase
          .from("product_images")
          .select('id, is_primary, sort_order, card_url')
          .eq('product_id', listing.id)
          .order('sort_order', { ascending: true });
        
        if (!verifyError && verifyImages) {
          console.log('🔍 [LISTINGS API] ====== VERIFICATION QUERY ======');
          verifyImages.forEach((img: any, idx: number) => {
            console.log(`🔍 [LISTINGS API] DB product_images[${idx}]:`, {
              id: img.id,
              is_primary: img.is_primary,
              sort_order: img.sort_order,
              card_url: img.card_url?.substring(70, 130),
            });
          });
          const primaryCount = verifyImages.filter((img: any) => img.is_primary === true).length;
          console.log(`🔍 [LISTINGS API] PRIMARY COUNT IN DB: ${primaryCount}`);
        }
      }
    } else {
      console.log('⚠️ [LISTINGS API] Skipping image insertion - no images or no listing ID');
    }

    return NextResponse.json({ listing }, { status: 201 });
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

