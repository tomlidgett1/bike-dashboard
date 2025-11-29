import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// GET /api/marketplace/listings/[id]
// Get a single listing
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data: listing, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Error in GET /api/marketplace/listings/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/marketplace/listings/[id]
// Update a listing
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // Map form data to database schema (similar to POST)
    const updateData = {
      listing_status: body.listingStatus,
      description: body.conditionDetails || body.title,
      price: body.price,
      marketplace_category:
        body.itemType === "bike"
          ? "Bicycles"
          : body.itemType === "part"
          ? "Parts"
          : "Apparel",
      marketplace_subcategory: body.marketplace_subcategory,
      frame_size: body.frameSize,
      frame_material: body.frameMaterial,
      bike_type: body.bikeType,
      groupset: body.groupset,
      wheel_size: body.wheelSize,
      suspension_type: body.suspensionType,
      bike_weight: body.bikeWeight,
      color_primary: body.colorPrimary,
      color_secondary: body.colorSecondary,
      part_type_detail: body.partTypeDetail,
      compatibility_notes: body.compatibilityNotes,
      material: body.material,
      weight: body.weight,
      size: body.size,
      gender_fit: body.genderFit,
      apparel_material: body.apparelMaterial,
      condition_rating: body.conditionRating,
      condition_details: body.conditionDetails,
      wear_notes: body.wearNotes,
      usage_estimate: body.usageEstimate,
      purchase_location: body.purchaseLocation,
      purchase_date: body.purchaseDate,
      service_history: body.serviceHistory,
      upgrades_modifications: body.upgradesModifications,
      reason_for_selling: body.reasonForSelling,
      is_negotiable: body.isNegotiable,
      shipping_available: body.shippingAvailable,
      shipping_cost: body.shippingCost,
      pickup_location: body.pickupLocation,
      included_accessories: body.includedAccessories,
      seller_contact_preference: body.sellerContactPreference,
      seller_phone: body.sellerPhone,
      seller_email: body.sellerEmail,
      images: body.images,
      primary_image_url: body.primaryImageUrl,
      published_at: body.publishedAt,
      expires_at: body.expiresAt,
      is_active: body.listingStatus === "active",
    };

    const { data: listing, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating listing:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Error in PUT /api/marketplace/listings/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/marketplace/listings/[id]
// Delete a listing (draft or remove active)
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("user_id, listing_status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If draft, actually delete. If active, mark as removed
    if (existing.listing_status === "draft") {
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("products")
        .update({ listing_status: "removed", is_active: false })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/marketplace/listings/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

