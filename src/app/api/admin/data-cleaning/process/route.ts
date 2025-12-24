import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/data-cleaning/process
 * 
 * Manually triggers processing of the description generation queue.
 * Calls the generate-product-descriptions Edge Function.
 * 
 * Body:
 * - limit: number (default 5) - Number of items to process
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
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 5;

    console.log(`[DATA-CLEANING PROCESS] User ${user.id} manually triggering queue processing (limit: ${limit})`);

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
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-product-descriptions`;

    console.log(`[DATA-CLEANING PROCESS] Calling edge function: ${edgeFunctionUrl}`);

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ limit }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error(`[DATA-CLEANING PROCESS] Edge function error:`, errorData);
      return NextResponse.json(
        {
          error: errorData.error || "Edge function failed",
          details: errorData,
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    console.log(`[DATA-CLEANING PROCESS] Complete:`, result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[DATA-CLEANING PROCESS] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

