import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Map form data to database schema
    const listingData = {
      user_id: user.id,
      listing_type: "private_listing",
      listing_source: "manual",
      listing_status: body.listingStatus || "draft",

      // Basic info
      description: body.conditionDetails || body.title || "",
      price: body.price,
      marketplace_category:
        body.itemType === "bike"
          ? "Bicycles"
          : body.itemType === "part"
          ? "Parts"
          : "Apparel",
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

      // Images
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
    };

    const { data: listing, error } = await supabase
      .from("products")
      .insert(listingData)
      .select()
      .single();

    if (error) {
      console.error("Error creating listing:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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
      .eq("listing_source", "manual")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("listing_status", status);
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

