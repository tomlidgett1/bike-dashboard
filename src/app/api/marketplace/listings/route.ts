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

      // Condition
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
      images: body.images || [],
      primary_image_url: body.primaryImageUrl,

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

    // DEBUG: Log what we're saving
    console.log('🖼️ [LISTINGS API] Images being saved:', body.images?.map((img: any, i: number) => ({
      index: i,
      isPrimary: img.isPrimary,
      cardUrl: img.cardUrl?.substring(70, 110),
    })));
    console.log('🖼️ [LISTINGS API] primaryImageUrl:', body.primaryImageUrl?.substring(70, 110));

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
    // Insert images into product_images table (single source of truth)
    // ============================================================
    const images = body.images || [];
    if (images.length > 0 && listing?.id) {
      console.log(`📸 [LISTINGS API] Inserting ${images.length} images into product_images table`);
      
      const imageRecords = images.map((img: any, index: number) => ({
        product_id: listing.id,
        cloudinary_url: img.url,
        card_url: img.cardUrl,
        thumbnail_url: img.thumbnailUrl,
        detail_url: img.detailUrl || img.url,
        external_url: img.url,
        is_primary: img.isPrimary || index === 0,
        sort_order: img.order || index,
        is_downloaded: true,
        approval_status: 'approved',
        uploaded_by: user.id,
        width: img.width || 800,
        height: img.height || 800,
        mime_type: 'image/webp',
      }));
      
      console.log('🖼️ [LISTINGS API] Image records being inserted:', imageRecords.map((r: any) => ({
        is_primary: r.is_primary,
        sort_order: r.sort_order,
        card_url: r.card_url?.substring(70, 110),
      })));

      const { error: imageError } = await supabase
        .from("product_images")
        .insert(imageRecords);

      if (imageError) {
        console.error("Error inserting images:", imageError);
        // Don't fail the whole request, images are stored in JSONB as backup
      } else {
        console.log(`✅ [LISTINGS API] ${images.length} images inserted into product_images table`);
      }
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

