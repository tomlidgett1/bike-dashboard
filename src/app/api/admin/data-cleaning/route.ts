import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/data-cleaning
 * 
 * Fetches statistics and canonical products for the data cleaning admin page.
 * 
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 50)
 * - filter: 'all' | 'with_description' | 'without_description' (default 'all')
 * - search: string (optional)
 * - category: string (optional)
 */
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const filter = searchParams.get("filter") || "all";
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";

    const offset = (page - 1) * limit;

    console.log(`[DATA-CLEANING] Fetching canonical products (page: ${page}, filter: ${filter})`);

    // Get queue stats
    const { data: queueStats, error: queueError } = await supabase.rpc(
      "get_description_queue_stats"
    );

    // If RPC doesn't exist yet, calculate manually
    let stats;
    if (queueError) {
      console.log("[DATA-CLEANING] Using manual stats calculation");
      
      const [
        { count: totalCount },
        { count: withDescCount },
        { count: pendingQueueCount },
        { count: processingQueueCount },
        { count: completedQueueCount },
        { count: failedQueueCount },
      ] = await Promise.all([
        supabase.from("canonical_products").select("*", { count: "exact", head: true }),
        supabase.from("canonical_products").select("*", { count: "exact", head: true }).not("product_description", "is", null),
        supabase.from("description_generation_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("description_generation_queue").select("*", { count: "exact", head: true }).eq("status", "processing"),
        supabase.from("description_generation_queue").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("description_generation_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
      ]);

      stats = {
        total: totalCount || 0,
        withDescription: withDescCount || 0,
        withoutDescription: (totalCount || 0) - (withDescCount || 0),
        queue: {
          pending: pendingQueueCount || 0,
          processing: processingQueueCount || 0,
          completed: completedQueueCount || 0,
          failed: failedQueueCount || 0,
        },
      };
    } else {
      stats = {
        total: (queueStats?.total_with_descriptions || 0) + (queueStats?.total_without_descriptions || 0),
        withDescription: queueStats?.total_with_descriptions || 0,
        withoutDescription: queueStats?.total_without_descriptions || 0,
        queue: {
          pending: queueStats?.pending_count || 0,
          processing: queueStats?.processing_count || 0,
          completed: queueStats?.completed_count || 0,
          failed: queueStats?.failed_count || 0,
        },
      };
    }

    // Build query for canonical products
    let query = supabase
      .from("canonical_products")
      .select(
        `
        id,
        normalized_name,
        display_name,
        upc,
        manufacturer,
        category,
        marketplace_category,
        marketplace_subcategory,
        product_description,
        bike_surface,
        description_generated_at,
        product_count,
        created_at,
        updated_at
      `,
        { count: "exact" }
      )
      .order("product_count", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    // Apply filter
    if (filter === "with_description") {
      query = query.not("product_description", "is", null);
    } else if (filter === "without_description") {
      query = query.is("product_description", null);
    }

    // Apply search
    if (search) {
      query = query.or(
        `normalized_name.ilike.%${search}%,display_name.ilike.%${search}%,upc.ilike.%${search}%,manufacturer.ilike.%${search}%`
      );
    }

    // Apply category filter
    if (category) {
      query = query.eq("marketplace_category", category);
    }

    const { data: products, error: productsError, count } = await query;

    if (productsError) {
      console.error("[DATA-CLEANING] Error fetching products:", productsError);
      return NextResponse.json(
        { error: productsError.message },
        { status: 500 }
      );
    }

    // Get queue status for each product
    const productIds = products?.map((p) => p.id) || [];
    const { data: queueItems } = await supabase
      .from("description_generation_queue")
      .select("canonical_product_id, status")
      .in("canonical_product_id", productIds);

    const queueStatusMap = new Map(
      queueItems?.map((q) => [q.canonical_product_id, q.status]) || []
    );

    // Add queue status to products
    const productsWithQueueStatus = products?.map((p) => ({
      ...p,
      queueStatus: queueStatusMap.get(p.id) || null,
    }));

    // Get unique categories for filter dropdown
    const { data: categories } = await supabase
      .from("canonical_products")
      .select("marketplace_category")
      .not("marketplace_category", "is", null)
      .order("marketplace_category");

    const uniqueCategories = [
      ...new Set(categories?.map((c) => c.marketplace_category).filter(Boolean)),
    ];

    return NextResponse.json({
      stats,
      products: productsWithQueueStatus || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      categories: uniqueCategories,
    });
  } catch (error) {
    console.error("[DATA-CLEANING] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

