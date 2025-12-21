import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// Admin Scheduled Uploads CRUD
// /api/admin/scheduled-uploads
// ============================================================

export const dynamic = 'force-dynamic';

// Helper to check admin access
async function checkAdminAccess(supabase: any) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { authorized: false, error: "Unauthorised", status: 401 };
  }

  if (user.email !== "tom@lidgett.net") {
    return { authorized: false, error: "Forbidden - Admin only", status: 403 };
  }

  return { authorized: true, user };
}

// ============================================================
// GET: Fetch all scheduled listings
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const authResult = await checkAdminAccess(supabase);

    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "all";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    console.log(`[SCHEDULED UPLOADS] Fetching listings, status: ${status}, page: ${page}`);

    // Build query
    let query = supabase
      .from("scheduled_listings")
      .select(
        `
        id,
        admin_user_id,
        target_user_id,
        scheduled_for,
        status,
        form_data,
        images,
        published_product_id,
        created_at,
        updated_at,
        published_at
      `,
        { count: "exact" }
      )
      .order("scheduled_for", { ascending: true });

    // Apply status filter
    if (status !== "all") {
      query = query.eq("status", status);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: listings, error: listingsError, count } = await query;

    if (listingsError) {
      console.error("[SCHEDULED UPLOADS] Error fetching:", listingsError);
      return NextResponse.json(
        { error: "Failed to fetch scheduled listings" },
        { status: 500 }
      );
    }

    // Fetch target user info for each listing
    const targetUserIds = [...new Set((listings || []).map((l: any) => l.target_user_id))];
    
    let userMap = new Map();
    if (targetUserIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("user_id, name, first_name, last_name, business_name, seller_display_name, email")
        .in("user_id", targetUserIds);

      (users || []).forEach((u: any) => {
        userMap.set(u.user_id, {
          name: u.seller_display_name || 
                u.business_name || 
                `${u.first_name || ""} ${u.last_name || ""}`.trim() || 
                u.name || 
                u.email,
          email: u.email,
        });
      });
    }

    // Transform listings with user info
    const transformedListings = (listings || []).map((listing: any) => ({
      ...listing,
      targetUser: userMap.get(listing.target_user_id) || { name: "Unknown", email: "" },
      title: listing.form_data?.title || listing.form_data?.brand || "Untitled",
      primaryImage: listing.images?.[0]?.cardUrl || listing.images?.[0]?.url || null,
    }));

    console.log(`[SCHEDULED UPLOADS] Found ${transformedListings.length} listings`);

    return NextResponse.json({
      listings: transformedListings,
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("[SCHEDULED UPLOADS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST: Create a new scheduled listing
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const authResult = await checkAdminAccess(supabase);

    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const { targetUserId, scheduledFor, formData, images } = body;

    // Validate required fields
    if (!targetUserId) {
      return NextResponse.json(
        { error: "Target user is required" },
        { status: 400 }
      );
    }

    if (!scheduledFor) {
      return NextResponse.json(
        { error: "Scheduled time is required" },
        { status: 400 }
      );
    }

    if (!formData || Object.keys(formData).length === 0) {
      return NextResponse.json(
        { error: "Listing form data is required" },
        { status: 400 }
      );
    }

    console.log(`[SCHEDULED UPLOADS] Creating scheduled listing for user ${targetUserId}`);
    console.log(`[SCHEDULED UPLOADS] Scheduled for: ${scheduledFor}`);

    // Insert the scheduled listing
    const { data: listing, error: insertError } = await supabase
      .from("scheduled_listings")
      .insert({
        admin_user_id: authResult.user.id,
        target_user_id: targetUserId,
        scheduled_for: scheduledFor,
        form_data: formData,
        images: images || [],
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[SCHEDULED UPLOADS] Error creating:", insertError);
      console.error("[SCHEDULED UPLOADS] Insert data:", {
        admin_user_id: authResult.user.id,
        target_user_id: targetUserId,
        scheduled_for: scheduledFor,
      });
      return NextResponse.json(
        { error: `Failed to create scheduled listing: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log(`[SCHEDULED UPLOADS] Created listing ${listing.id}`);

    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    console.error("[SCHEDULED UPLOADS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH: Update a scheduled listing (reschedule, cancel, etc.)
// ============================================================
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const authResult = await checkAdminAccess(supabase);

    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const { id, scheduledFor, status, formData, images, targetUserId } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Listing ID is required" },
        { status: 400 }
      );
    }

    console.log(`[SCHEDULED UPLOADS] Updating listing ${id}`);

    // Build update object
    const updateData: any = {};
    if (scheduledFor !== undefined) updateData.scheduled_for = scheduledFor;
    if (status !== undefined) updateData.status = status;
    if (formData !== undefined) updateData.form_data = formData;
    if (images !== undefined) updateData.images = images;
    if (targetUserId !== undefined) updateData.target_user_id = targetUserId;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: listing, error: updateError } = await supabase
      .from("scheduled_listings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("[SCHEDULED UPLOADS] Error updating:", updateError);
      return NextResponse.json(
        { error: "Failed to update scheduled listing" },
        { status: 500 }
      );
    }

    console.log(`[SCHEDULED UPLOADS] Updated listing ${listing.id}`);

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("[SCHEDULED UPLOADS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE: Delete a scheduled listing
// ============================================================
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const authResult = await checkAdminAccess(supabase);

    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Listing ID is required" },
        { status: 400 }
      );
    }

    console.log(`[SCHEDULED UPLOADS] Deleting listing ${id}`);

    const { error: deleteError } = await supabase
      .from("scheduled_listings")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[SCHEDULED UPLOADS] Error deleting:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete scheduled listing" },
        { status: 500 }
      );
    }

    console.log(`[SCHEDULED UPLOADS] Deleted listing ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SCHEDULED UPLOADS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

