import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// GET /api/marketplace/purchases
// Get user's purchase history
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
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const search = searchParams.get("search") || "";

    const offset = (page - 1) * pageSize;

    // Build query for purchases with product and seller details
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
          price,
          marketplace_category,
          marketplace_subcategory
        ),
        seller:users!purchases_seller_id_fkey(
          user_id,
          name,
          business_name,
          account_type
        )
      `,
        { count: "exact" }
      )
      .eq("buyer_id", user.id)
      .order("purchase_date", { ascending: false });

    // Filter by status if provided
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Search by product name/description if provided
    if (search) {
      // Note: This is a simple approach. For better search, we'd need to use full-text search
      // For now, we'll filter client-side or use a more complex query
      query = query.or(
        `product.description.ilike.%${search}%,product.display_name.ilike.%${search}%`
      );
    }

    // Apply pagination
    query = query.range(offset, offset + pageSize - 1);

    const { data: purchases, error, count } = await query;

    if (error) {
      console.error("Error fetching purchases:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      purchases: purchases || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
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

