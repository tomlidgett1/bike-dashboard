import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// GET /api/marketplace/purchases
// Get user's purchase history (as buyer or seller)
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
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const mode = searchParams.get("mode") || "buying"; // 'buying' or 'selling'
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const search = searchParams.get("search") || "";

    const offset = (page - 1) * pageSize;
    
    // Determine which ID field to filter by based on mode
    const userIdField = mode === "selling" ? "seller_id" : "buyer_id";

    // Build query for purchases with product details
    let query = supabase
      .from("purchases")
      .select(
        `
        *,
        product:products(
          id,
          description,
          display_name,
          primary_image_url,
          cached_image_url,
          images,
          price,
          marketplace_category,
          marketplace_subcategory,
          listing_type
        )
      `,
        { count: "exact" }
      )
      .eq(userIdField, user.id)
      .order("purchase_date", { ascending: false });

    // Filter by status category
    if (status === "active") {
      // Active = pending, confirmed, paid, shipped
      query = query.in("status", ["pending", "confirmed", "paid", "shipped"]);
    } else if (status === "completed") {
      // Completed = delivered
      query = query.eq("status", "delivered");
    } else if (status === "disputed") {
      // Disputed orders
      query = query.eq("funds_status", "disputed");
    } else if (status !== "all") {
      // Specific status filter
      query = query.eq("status", status);
    }

    // Apply pagination
    query = query.range(offset, offset + pageSize - 1);

    const { data: purchases, error, count } = await query;

    if (error) {
      console.error("Error fetching purchases:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch counts for sidebar categories
    const countQueries = await Promise.all([
      // All
      supabase
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq(userIdField, user.id),
      // Active
      supabase
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq(userIdField, user.id)
        .in("status", ["pending", "confirmed", "paid", "shipped"]),
      // Completed
      supabase
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq(userIdField, user.id)
        .eq("status", "delivered"),
      // Disputes
      supabase
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq(userIdField, user.id)
        .eq("funds_status", "disputed"),
    ]);

    const counts = {
      all: countQueries[0].count || 0,
      active: countQueries[1].count || 0,
      completed: countQueries[2].count || 0,
      disputes: countQueries[3].count || 0,
      archived: 0, // TODO: Add archived field to purchases table
    };

    // Fetch seller/buyer info for each purchase
    const purchasesWithUsers = await Promise.all(
      (purchases || []).map(async (purchase) => {
        // For buying mode, get seller info. For selling mode, get buyer info.
        const otherUserId = mode === "selling" ? purchase.buyer_id : purchase.seller_id;
        
        if (!otherUserId) {
          return { ...purchase, seller: null, buyer: null };
        }
        
        const { data: otherUser } = await supabase
          .from("users")
          .select("user_id, name, business_name, account_type")
          .eq("user_id", otherUserId)
          .single();
        
        if (mode === "selling") {
          return { ...purchase, buyer: otherUser, seller: null };
        }
        return { ...purchase, seller: otherUser, buyer: null };
      })
    );

    return NextResponse.json({
      purchases: purchasesWithUsers,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      counts,
    });
  } catch (error) {
    console.error("Error in GET /api/marketplace/purchases:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/marketplace/purchases
// Create a new purchase (when user buys something)
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
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const {
      product_id,
      seller_id,
      item_price,
      shipping_cost = 0,
      tax_amount = 0,
      shipping_address,
      shipping_method,
      payment_method,
      buyer_notes,
    } = body;

    // Validate required fields
    if (!product_id || !seller_id || !item_price) {
      return NextResponse.json(
        { error: "Missing required fields: product_id, seller_id, item_price" },
        { status: 400 }
      );
    }

    // Calculate total
    const total_amount = parseFloat(item_price) + parseFloat(shipping_cost) + parseFloat(tax_amount);

    // Generate order number
    const { data: orderNumberData } = await supabase.rpc("generate_order_number");
    const order_number = orderNumberData || `ORD-${Date.now()}`;

    // Create purchase record
    const { data: purchase, error } = await supabase
      .from("purchases")
      .insert({
        buyer_id: user.id,
        seller_id,
        product_id,
        order_number,
        item_price,
        shipping_cost,
        tax_amount,
        total_amount,
        shipping_address,
        shipping_method,
        payment_method,
        buyer_notes,
        status: "pending",
        payment_status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating purchase:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ purchase }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/marketplace/purchases:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

