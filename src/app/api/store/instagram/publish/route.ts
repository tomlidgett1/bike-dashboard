import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { isInstagramDestination } from "@/lib/instagram/formats";
import { publishInstagramImagePost } from "@/lib/instagram/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/store/instagram/publish
 * Body: { imageUrl?, imageUrls?, caption?, prompt?, postId?, destination? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls
          .filter((url: unknown): url is string => typeof url === "string")
          .map((url: string) => url.trim())
          .filter(Boolean)
      : [];
    const caption = typeof body.caption === "string" ? body.caption : "";
    const prompt = typeof body.prompt === "string" ? body.prompt : null;
    const postId = typeof body.postId === "string" ? body.postId : null;
    const destination = isInstagramDestination(body.destination)
      ? body.destination
      : "post";

    if (!imageUrl && imageUrls.length === 0) {
      return NextResponse.json(
        { error: "Add at least one photo before publishing." },
        { status: 400 },
      );
    }
    if (destination === "post" && !caption.trim()) {
      return NextResponse.json(
        { error: "Caption is required for feed posts." },
        { status: 400 },
      );
    }
    if (destination === "story" && imageUrls.length > 1) {
      return NextResponse.json(
        { error: "Stories can only publish one photo." },
        { status: 400 },
      );
    }

    const result = await publishInstagramImagePost({
      ownerUserId: auth.user.id,
      imageUrl: imageUrl || imageUrls[0],
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      caption: caption.trim(),
      prompt,
      existingPostId: postId,
      destination,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[ig-publish] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not publish to Instagram.",
      },
      { status: 500 },
    );
  }
}
