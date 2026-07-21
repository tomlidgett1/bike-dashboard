import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { isInstagramPostAspect } from "@/lib/instagram/formats";
import { generateInstagramCaption } from "@/lib/instagram/generate-caption";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/store/instagram/brand
 * Body: { imageUrls: string[], aspect?, prompt?, includeLogo?, autoCaption?, storeUsername? }
 * AI-edits already-uploaded photos (optional logo), then optionally drafts a caption.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter(
          (url: unknown): url is string =>
            typeof url === "string" && Boolean(url.trim()),
        )
      : [];
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const includeLogo = body.includeLogo === true;
    const autoCaption = body.autoCaption !== false;
    const storeUsername =
      typeof body.storeUsername === "string" ? body.storeUsername : "";
    const aspect = isInstagramPostAspect(body.aspect) ? body.aspect : "square";

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: "Add at least one photo first." },
        { status: 400 },
      );
    }
    if (imageUrls.length > 10) {
      return NextResponse.json(
        { error: "Instagram carousels support up to 10 photos." },
        { status: 400 },
      );
    }
    if (!prompt.trim() && !includeLogo) {
      return NextResponse.json(
        {
          error:
            "Describe the changes you want, or turn on Include our logo.",
        },
        { status: 400 },
      );
    }

    // Dynamic import avoids Turbopack named-export interop glitches on this module.
    const imageModule = await import("@/lib/instagram/generate-image");
    const editInstagramPhotoUrls =
      imageModule.editInstagramPhotoUrls ??
      imageModule.default?.editInstagramPhotoUrls;
    if (typeof editInstagramPhotoUrls !== "function") {
      throw new Error("Image edit service failed to load. Refresh and try again.");
    }

    const editedUrls = await editInstagramPhotoUrls({
      ownerUserId: auth.user.id,
      imageUrls,
      aspect,
      prompt,
      includeLogo,
    });

    let caption = "";
    if (autoCaption && prompt.trim()) {
      caption = await generateInstagramCaption({
        prompt,
        storeUsername,
        destination: "post",
      }).catch((error) => {
        console.error("[ig-brand] caption draft failed:", error);
        return "";
      });
    }

    return NextResponse.json({
      success: true,
      imageUrls: editedUrls,
      imageUrl: editedUrls[0] || null,
      caption,
    });
  } catch (error) {
    console.error("[ig-brand] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not edit photos with AI.",
      },
      { status: 500 },
    );
  }
}
