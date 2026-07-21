import { NextRequest, NextResponse } from "next/server";
import { syncInstagramCampaignStatus } from "@/lib/instagram/campaigns";
import { publishInstagramImagePost } from "@/lib/instagram/publish";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (
    expectedSecret &&
    request.headers.get("authorization") !== `Bearer ${expectedSecret}`
  ) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: duePosts, error } = await admin
    .from("store_instagram_posts")
    .select(
      "id, user_id, campaign_id, prompt, caption, image_url, image_urls, destination, scheduled_at",
    )
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);
  if (error) {
    return NextResponse.json(
      { success: false, error: `Could not load due posts: ${error.message}` },
      { status: 500 },
    );
  }

  let posted = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ postId: string; error: string }> = [];

  for (const post of duePosts || []) {
    const { data: claimed, error: claimError } = await admin
      .from("store_instagram_posts")
      .update({ status: "processing", error_message: null })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) {
      skipped += 1;
      continue;
    }

    if (post.campaign_id) {
      await admin
        .from("store_instagram_campaigns")
        .update({ status: "posting", last_error: null })
        .eq("id", post.campaign_id)
        .neq("status", "cancelled");
    }

    try {
      const imageUrls = Array.isArray(post.image_urls)
        ? (post.image_urls as unknown[])
            .filter((url): url is string => typeof url === "string")
            .map((url) => url.trim())
            .filter(Boolean)
        : [];
      const imageUrl =
        imageUrls[0] ||
        (typeof post.image_url === "string" ? post.image_url.trim() : "");
      if (!imageUrl) throw new Error("Scheduled post has no image.");
      await publishInstagramImagePost({
        ownerUserId: post.user_id,
        existingPostId: post.id,
        imageUrl,
        imageUrls: imageUrls.length > 0 ? imageUrls : [imageUrl],
        caption: post.caption,
        prompt: post.prompt,
        destination: post.destination === "story" ? "story" : "post",
      });
      posted += 1;
    } catch (publishError) {
      failed += 1;
      const message =
        publishError instanceof Error
          ? publishError.message
          : "Instagram publish failed.";
      errors.push({ postId: post.id, error: message });
    } finally {
      if (post.campaign_id) {
        await syncInstagramCampaignStatus(post.campaign_id).catch((syncError) => {
          console.error("[ig-cron] campaign status sync failed:", syncError);
        });
      }
    }
  }

  return NextResponse.json({
    success: failed === 0,
    due: duePosts?.length || 0,
    posted,
    failed,
    skipped,
    errors,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
