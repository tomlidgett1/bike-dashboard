import { NextRequest, NextResponse } from "next/server";
import { resolveForYouIdentity } from "@/lib/for-you/identity";
import { enhanceForYouFeed } from "@/lib/for-you/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/for-you/enhance { feedId }
 * Background LLM pass over a previously built deterministic feed. The page
 * renders before this is called; on any failure the client keeps what it has.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const feedId = typeof body.feedId === "string" ? body.feedId : null;
    if (!feedId) {
      return NextResponse.json({ success: false, error: "feedId required" }, { status: 400 });
    }

    const identity = await resolveForYouIdentity();
    const feed = await enhanceForYouFeed(identity, feedId);

    if (!feed) {
      // Not an error from the client's perspective — keep deterministic feed.
      return NextResponse.json({ success: true, feed: null });
    }

    return NextResponse.json({ success: true, feed });
  } catch (error) {
    console.error("[for-you/enhance] error:", error);
    return NextResponse.json({ success: true, feed: null });
  }
}
