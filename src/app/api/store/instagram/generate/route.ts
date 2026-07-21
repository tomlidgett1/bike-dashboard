import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  isInstagramDestination,
  isInstagramPostAspect,
} from "@/lib/instagram/formats";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/store/instagram/generate
 * Body: { prompt, caption?, storeUsername?, destination?, aspect?, autoCaption? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const caption = typeof body.caption === "string" ? body.caption : "";
    const storeUsername =
      typeof body.storeUsername === "string" ? body.storeUsername : "";
    const autoCaption = body.autoCaption !== false;
    const includeLogo = body.includeLogo === true;
    const productId =
      typeof body.productId === "string" && body.productId.trim()
        ? body.productId.trim()
        : null;
    const destination = isInstagramDestination(body.destination)
      ? body.destination
      : "post";
    const aspect = isInstagramPostAspect(body.aspect) ? body.aspect : "square";

    if (!prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    // Dynamic import avoids Turbopack named-export interop glitches on this module.
    const imageModule = await import("@/lib/instagram/generate-image");
    const generateInstagramImageForStore =
      imageModule.generateInstagramImageForStore ??
      imageModule.default?.generateInstagramImageForStore;
    if (typeof generateInstagramImageForStore !== "function") {
      throw new Error(
        "Image generation service failed to load. Refresh and try again.",
      );
    }

    const result = await generateInstagramImageForStore({
      ownerUserId: auth.user.id,
      prompt,
      caption,
      storeUsername,
      autoCaption,
      destination,
      aspect,
      includeLogo,
      productId,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[ig-generate] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not generate Instagram image.",
      },
      { status: 500 },
    );
  }
}
