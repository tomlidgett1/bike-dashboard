import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveForYouIdentity } from "@/lib/for-you/identity";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/for-you/dismiss { productId?, carouselKey?, kind? }
 * Records an explicit negative signal ("not interested" / hide carousel).
 */
export async function POST(request: NextRequest) {
  try {
    const identity = await resolveForYouIdentity();
    if (!identity.userId && !identity.anonymousId) {
      return NextResponse.json({ success: false, error: "No identity" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const productId =
      typeof body.productId === "string" && UUID_RE.test(body.productId) ? body.productId : null;
    const carouselKey =
      typeof body.carouselKey === "string" && /^[a-z0-9-]{2,60}$/.test(body.carouselKey)
        ? body.carouselKey
        : null;
    const kind = body.kind === "hide_carousel" ? "hide_carousel" : "not_interested";

    if (!productId && !carouselKey) {
      return NextResponse.json(
        { success: false, error: "productId or carouselKey required" },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("recommendation_dismissals").insert({
      user_id: identity.userId,
      anonymous_id: identity.userId ? null : identity.anonymousId,
      product_id: productId,
      carousel_key: carouselKey,
      kind,
    });

    if (error) {
      console.error("[for-you/dismiss] insert failed:", error.message);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[for-you/dismiss] error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
