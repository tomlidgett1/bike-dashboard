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
// Update a listing with change logging
// ============================================================

// Field mapping from request body keys to database column names
const FIELD_MAPPING: Record<string, string> = {
  listingStatus: "listing_status",
  title: "description",
  conditionDetails: "condition_details",
  price: "price",
  marketplace_subcategory: "marketplace_subcategory",
  frameSize: "frame_size",
  frameMaterial: "frame_material",
  bikeType: "bike_type",
  groupset: "groupset",
  wheelSize: "wheel_size",
  suspensionType: "suspension_type",
  bikeWeight: "bike_weight",
  colorPrimary: "color_primary",
  colorSecondary: "color_secondary",
  partTypeDetail: "part_type_detail",
  compatibilityNotes: "compatibility_notes",
  material: "material",
  weight: "weight",
  size: "size",
  genderFit: "gender_fit",
  apparelMaterial: "apparel_material",
  conditionRating: "condition_rating",
  wearNotes: "wear_notes",
  usageEstimate: "usage_estimate",
  purchaseLocation: "purchase_location",
  purchaseDate: "purchase_date",
  serviceHistory: "service_history",
  upgradesModifications: "upgrades_modifications",
  reasonForSelling: "reason_for_selling",
  isNegotiable: "is_negotiable",
  shippingAvailable: "shipping_available",
  shippingCost: "shipping_cost",
  pickupLocation: "pickup_location",
  includedAccessories: "included_accessories",
  sellerContactPreference: "seller_contact_preference",
  sellerPhone: "seller_phone",
  sellerEmail: "seller_email",
  images: "images",
  primaryImageUrl: "primary_image_url",
  publishedAt: "published_at",
  expiresAt: "expires_at",
  brand: "brand",
  model: "model",
  modelYear: "model_year",
  displayName: "display_name",
};

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

    // Fetch full existing product for change comparison
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const logChanges = body.logChanges !== false; // Default to true

    // Build update data - only include fields that are provided
    const updateData: Record<string, any> = {};

    // Status update (quick action)
    if (body.listingStatus !== undefined) {
      updateData.listing_status = body.listingStatus;
      updateData.is_active = body.listingStatus === "active";
    }

    // Only include other fields if they're explicitly provided (full form update)
    if (body.title !== undefined || body.conditionDetails !== undefined) {
      updateData.description = body.conditionDetails || body.title;
    }
    if (body.displayName !== undefined) updateData.display_name = body.displayName;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.brand !== undefined) updateData.brand = body.brand;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.modelYear !== undefined) updateData.model_year = body.modelYear;
    if (body.itemType !== undefined) {
      updateData.marketplace_category =
        body.itemType === "bike"
          ? "Bicycles"
          : body.itemType === "part"
          ? "Parts"
          : "Apparel";
    }
    if (body.marketplace_subcategory !== undefined) updateData.marketplace_subcategory = body.marketplace_subcategory;
    if (body.frameSize !== undefined) updateData.frame_size = body.frameSize;
    if (body.frameMaterial !== undefined) updateData.frame_material = body.frameMaterial;
    if (body.bikeType !== undefined) updateData.bike_type = body.bikeType;
    if (body.groupset !== undefined) updateData.groupset = body.groupset;
    if (body.wheelSize !== undefined) updateData.wheel_size = body.wheelSize;
    if (body.suspensionType !== undefined) updateData.suspension_type = body.suspensionType;
    if (body.bikeWeight !== undefined) updateData.bike_weight = body.bikeWeight;
    if (body.colorPrimary !== undefined) updateData.color_primary = body.colorPrimary;
    if (body.colorSecondary !== undefined) updateData.color_secondary = body.colorSecondary;
    if (body.partTypeDetail !== undefined) updateData.part_type_detail = body.partTypeDetail;
    if (body.compatibilityNotes !== undefined) updateData.compatibility_notes = body.compatibilityNotes;
    if (body.material !== undefined) updateData.material = body.material;
    if (body.weight !== undefined) updateData.weight = body.weight;
    if (body.size !== undefined) updateData.size = body.size;
    if (body.genderFit !== undefined) updateData.gender_fit = body.genderFit;
    if (body.apparelMaterial !== undefined) updateData.apparel_material = body.apparelMaterial;
    if (body.conditionRating !== undefined) updateData.condition_rating = body.conditionRating;
    if (body.conditionDetails !== undefined) updateData.condition_details = body.conditionDetails;
    if (body.wearNotes !== undefined) updateData.wear_notes = body.wearNotes;
    if (body.usageEstimate !== undefined) updateData.usage_estimate = body.usageEstimate;
    if (body.purchaseLocation !== undefined) updateData.purchase_location = body.purchaseLocation;
    if (body.purchaseDate !== undefined) updateData.purchase_date = body.purchaseDate;
    if (body.serviceHistory !== undefined) updateData.service_history = body.serviceHistory;
    if (body.upgradesModifications !== undefined) updateData.upgrades_modifications = body.upgradesModifications;
    if (body.reasonForSelling !== undefined) updateData.reason_for_selling = body.reasonForSelling;
    if (body.isNegotiable !== undefined) updateData.is_negotiable = body.isNegotiable;
    if (body.shippingAvailable !== undefined) updateData.shipping_available = body.shippingAvailable;
    if (body.shippingCost !== undefined) updateData.shipping_cost = body.shippingCost;
    if (body.pickupLocation !== undefined) updateData.pickup_location = body.pickupLocation;
    if (body.includedAccessories !== undefined) updateData.included_accessories = body.includedAccessories;
    if (body.sellerContactPreference !== undefined) updateData.seller_contact_preference = body.sellerContactPreference;
    if (body.sellerPhone !== undefined) updateData.seller_phone = body.sellerPhone;
    if (body.sellerEmail !== undefined) updateData.seller_email = body.sellerEmail;
    if (body.images !== undefined) updateData.images = body.images;
    if (body.primaryImageUrl !== undefined) updateData.primary_image_url = body.primaryImageUrl;
    if (body.publishedAt !== undefined) updateData.published_at = body.publishedAt;
    if (body.expiresAt !== undefined) updateData.expires_at = body.expiresAt;

    // Don't update if no fields to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Perform the update
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

    // Log changes if enabled
    if (logChanges) {
      const changeLogs: Array<{
        listing_id: string;
        user_id: string;
        field_name: string;
        old_value: any;
        new_value: any;
      }> = [];

      // Compare old vs new values for each updated field
      for (const [dbField, newValue] of Object.entries(updateData)) {
        const oldValue = existing[dbField];
        
        // Only log if the value actually changed
        const oldJson = JSON.stringify(oldValue);
        const newJson = JSON.stringify(newValue);
        
        if (oldJson !== newJson) {
          changeLogs.push({
            listing_id: id,
            user_id: user.id,
            field_name: dbField,
            old_value: oldValue,
            new_value: newValue,
          });
        }
      }

      // Insert change logs if there are any
      if (changeLogs.length > 0) {
        const { error: logError } = await supabase
          .from("listing_edit_logs")
          .insert(changeLogs);

        if (logError) {
          // Don't fail the request, just log the error
          console.error("Error inserting edit logs:", logError);
        }
      }
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

