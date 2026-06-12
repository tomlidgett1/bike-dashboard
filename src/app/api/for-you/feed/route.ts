import { NextRequest, NextResponse } from "next/server";
import { resolveForYouIdentity } from "@/lib/for-you/identity";
import { getForYouFeed } from "@/lib/for-you/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/for-you/feed
 * Deterministic, fast. Never waits for the LLM.
 *   ?refresh=1 — bypass the cached feed (used after strong new intent).
 */
export async function GET(request: NextRequest) {
  try {
    const identity = await resolveForYouIdentity();
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

    const feed = await getForYouFeed(identity, { forceRefresh });

    return NextResponse.json(
      { success: true, feed },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[for-you/feed] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build feed" },
      { status: 500 },
    );
  }
}
