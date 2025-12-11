import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// GET /api/marketplace/listings/[id]/logs
// Get edit history for a listing (only accessible by owner)
// ============================================================

export interface EditLog {
  id: string;
  listing_id: string;
  user_id: string;
  field_name: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

export interface EditLogsResponse {
  logs: EditLog[];
  total: number;
}

export async function GET(
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

    // Verify ownership of the listing
    const { data: listing, error: listingError } = await supabase
      .from("products")
      .select("user_id")
      .eq("id", id)
      .single();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Fetch edit logs
    const { data: logs, error: logsError, count } = await supabase
      .from("listing_edit_logs")
      .select("*", { count: "exact" })
      .eq("listing_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (logsError) {
      console.error("Error fetching edit logs:", logsError);
      return NextResponse.json(
        { error: "Failed to fetch edit logs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      logs: logs || [],
      total: count || 0,
    } as EditLogsResponse);
  } catch (error) {
    console.error("Error in GET /api/marketplace/listings/[id]/logs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
