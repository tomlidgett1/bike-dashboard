import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: purchaseId } = await params;

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First verify the user has access to this purchase (buyer or seller)
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, buyer_id, seller_id")
      .eq("id", purchaseId)
      .single();

    if (purchaseError || !purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    if (purchase.buyer_id !== user.id && purchase.seller_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Fetch all events for this purchase
    const { data: events, error: eventsError } = await supabase
      .from("order_events")
      .select(`
        id,
        event_type,
        previous_status,
        new_status,
        event_data,
        triggered_by,
        triggered_by_role,
        created_at
      `)
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: true });

    if (eventsError) {
      console.error("Error fetching order events:", eventsError);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error("Error in GET /api/marketplace/purchases/[purchaseId]/events:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

