import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// Admin Users Endpoint for Scheduled Uploads
// GET /api/admin/scheduled-uploads/users
// Fetches all users for the admin to select from
// ============================================================

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // Admin check - only tom@lidgett.net can access
    if (user.email !== "tom@lidgett.net") {
      return NextResponse.json(
        { error: "Forbidden - Admin only" },
        { status: 403 }
      );
    }

    // Get search parameter
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";

    console.log(`[ADMIN USERS] Fetching users for scheduled uploads, search: "${search}"`);

    // Build query to fetch all users
    let query = supabase
      .from("users")
      .select(`
        id,
        user_id,
        name,
        first_name,
        last_name,
        email,
        business_name,
        seller_display_name,
        account_type,
        created_at
      `)
      .order("created_at", { ascending: false });

    // Apply search filter if provided
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,business_name.ilike.%${search}%,email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
      );
    }

    const { data: users, error: usersError } = await query.limit(100);

    if (usersError) {
      console.error("[ADMIN USERS] Error fetching users:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    // Transform users for the dropdown
    const transformedUsers = (users || []).map((u: any) => ({
      id: u.user_id, // Use user_id (auth.users reference) for the target
      name: u.seller_display_name || 
            u.business_name || 
            `${u.first_name || ""} ${u.last_name || ""}`.trim() || 
            u.name || 
            u.email || 
            "Unknown User",
      email: u.email,
      businessName: u.business_name,
      accountType: u.account_type,
    }));

    console.log(`[ADMIN USERS] Found ${transformedUsers.length} users`);

    return NextResponse.json({
      users: transformedUsers,
      total: transformedUsers.length,
    });
  } catch (error) {
    console.error("[ADMIN USERS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

