import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  isInstagramDestination,
  isInstagramPostAspect,
} from "@/lib/instagram/formats";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/store/instagram/schedule
 * Schedule a single (or carousel) Instagram draft for later publish.
 * Body: { imageUrl?, imageUrls?, caption?, prompt?, postId?, destination?, aspect?, scheduledAt }
 * `scheduledAt` must be a UTC ISO timestamp (convert Melbourne wall time on the client).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const imageUrl =
      typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls
          .filter((url: unknown): url is string => typeof url === "string")
          .map((url: string) => url.trim())
          .filter(Boolean)
      : [];
    const urls = imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [];
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";
    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim() || null : null;
    const postId =
      typeof body.postId === "string" && body.postId.trim()
        ? body.postId.trim()
        : null;
    const destination = isInstagramDestination(body.destination)
      ? body.destination
      : "post";
    const aspect = isInstagramPostAspect(body.aspect) ? body.aspect : "square";
    const scheduledAtRaw =
      typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : "";

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "Generate or attach photos first." },
        { status: 400 },
      );
    }
    if (urls.length > 10) {
      return NextResponse.json(
        { error: "Instagram carousels support up to 10 photos." },
        { status: 400 },
      );
    }
    if (destination === "story" && urls.length > 1) {
      return NextResponse.json(
        { error: "Stories can only schedule one photo." },
        { status: 400 },
      );
    }
    if (destination === "post" && !caption) {
      return NextResponse.json(
        { error: "Add a caption before scheduling." },
        { status: 400 },
      );
    }
    if (!scheduledAtRaw) {
      return NextResponse.json(
        { error: "Choose a date and time to schedule." },
        { status: 400 },
      );
    }

    const scheduledAt = new Date(scheduledAtRaw);
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { error: "Choose a valid date and time." },
        { status: 400 },
      );
    }
    if (scheduledAt.getTime() <= Date.now() + 60_000) {
      return NextResponse.json(
        {
          error:
            "Choose a time at least one minute in the future (Melbourne time).",
        },
        { status: 400 },
      );
    }

    const admin = createServiceRoleClient();
    const payload = {
      prompt,
      caption,
      image_url: urls[0],
      image_urls: urls,
      status: "scheduled" as const,
      scheduled_at: scheduledAt.toISOString(),
      destination,
      aspect,
      error_message: null,
    };

    if (postId) {
      const { data, error } = await admin
        .from("store_instagram_posts")
        .update(payload)
        .eq("id", postId)
        .eq("user_id", auth.user.id)
        .in("status", ["draft", "scheduled", "failed"])
        .select("id, scheduled_at, status")
        .maybeSingle();
      if (error) {
        throw new Error(`Could not schedule post: ${error.message}`);
      }
      if (!data) {
        return NextResponse.json(
          { error: "That draft could not be scheduled." },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        postId: data.id,
        scheduledAt: data.scheduled_at,
        status: data.status,
      });
    }

    const { data, error } = await admin
      .from("store_instagram_posts")
      .insert({
        user_id: auth.user.id,
        ...payload,
      })
      .select("id, scheduled_at, status")
      .single();
    if (error || !data) {
      throw new Error(
        `Could not schedule post: ${error?.message ?? "unknown error"}`,
      );
    }

    return NextResponse.json({
      success: true,
      postId: data.id,
      scheduledAt: data.scheduled_at,
      status: data.status,
    });
  } catch (error) {
    console.error("[ig-schedule] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not schedule Instagram post.",
      },
      { status: 500 },
    );
  }
}
