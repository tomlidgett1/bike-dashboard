import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/categorise-all-canonical
 * 
 * Triggers AI categorisation for all canonical products
 * 
 * Body:
 * - processAll: boolean (true = all products, false = only uncategorised)
 * - limit?: number (optional limit for testing)
 * 
 * Admin-only endpoint
 */
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

    // Check if user is admin (you can add your own admin check logic here)
    const { data: profile } = await supabase
      .from("users")
      .select("account_type")
      .eq("id", user.id)
      .single();

    // TODO: Add proper admin check based on your user model
    // For now, allowing any authenticated user to run this
    console.log(`[CATEGORISE ALL] User ${user.id} (${profile?.account_type}) triggering categorisation`);

    const body = await request.json();
    const processAll = body.processAll ?? true; // Default to processing all
    const limit = body.limit;

    console.log(`[CATEGORISE ALL] Starting bulk categorisation...`);
    console.log(`  - Process all: ${processAll}`);
    console.log(`  - Limit: ${limit || "none"}`);

    // Get user's session for auth
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "No session found" },
        { status: 401 }
      );
    }

    // Call the edge function
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/categorise-canonical-products`;

    console.log(`[CATEGORISE ALL] Calling edge function: ${edgeFunctionUrl}`);

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        processAll,
        limit,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[CATEGORISE ALL] Edge function error:`, errorData);
      return NextResponse.json(
        {
          error: errorData.error || "Edge function failed",
          details: errorData,
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    console.log(`[CATEGORISE ALL] Complete:`, result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[CATEGORISE ALL] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/categorise-all-canonical
 * 
 * Get statistics about canonical product categorisation
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get statistics
    const [totalResult, categorisedResult, uncategorisedResult] =
      await Promise.all([
        supabase
          .from("canonical_products")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("canonical_products")
          .select("id", { count: "exact", head: true })
          .not("marketplace_category", "is", null),
        supabase
          .from("canonical_products")
          .select("id", { count: "exact", head: true })
          .is("marketplace_category", null),
      ]);

    const total = totalResult.count || 0;
    const categorised = categorisedResult.count || 0;
    const uncategorised = uncategorisedResult.count || 0;

    const stats = {
      total,
      categorised,
      uncategorised,
      percentageCategorised: total > 0 ? (categorised / total) * 100 : 0,
    };

    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error("[CATEGORISE ALL] Stats error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

