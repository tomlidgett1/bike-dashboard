/**
 * Instagram posting via Composio (auth happens in Yellow Jersey Connect flow).
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  publishInstagramCarouselPost,
  publishInstagramPhotoPost,
} from "@/lib/composio/instagram";
import type { InstagramDestination } from "@/lib/instagram/formats";

export type PublishInstagramPostResult = {
  postId: string;
  mediaId: string;
  permalink: string | null;
  containerId: string;
};

function normaliseImageUrls(params: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): string[] {
  const fromList = (params.imageUrls || [])
    .map((url) => url.trim())
    .filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = params.imageUrl?.trim();
  return single ? [single] : [];
}

export async function publishInstagramImagePost(params: {
  ownerUserId: string;
  imageUrl?: string;
  imageUrls?: string[];
  caption: string;
  prompt?: string | null;
  existingPostId?: string | null;
  destination?: InstagramDestination;
}): Promise<PublishInstagramPostResult> {
  const imageUrls = normaliseImageUrls(params);
  if (imageUrls.length === 0) {
    throw new Error("Add at least one photo before publishing.");
  }
  if (imageUrls.length > 10) {
    throw new Error("Instagram supports up to 10 photos per post.");
  }

  const destination = params.destination ?? "post";
  if (destination === "story" && imageUrls.length > 1) {
    throw new Error("Stories can only publish one photo. Remove the extras first.");
  }

  const coverUrl = imageUrls[0];
  const admin = createServiceRoleClient();
  let postId = params.existingPostId ?? null;

  if (!postId) {
    const { data, error } = await admin
      .from("store_instagram_posts")
      .insert({
        user_id: params.ownerUserId,
        prompt: params.prompt ?? null,
        caption: params.caption,
        image_url: coverUrl,
        image_urls: imageUrls,
        status: "processing",
        destination,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Could not create post record: ${error?.message ?? "unknown"}`);
    }
    postId = data.id as string;
  } else {
    await admin
      .from("store_instagram_posts")
      .update({
        caption: params.caption,
        image_url: coverUrl,
        image_urls: imageUrls,
        status: "processing",
        destination,
        error_message: null,
      })
      .eq("id", postId)
      .eq("user_id", params.ownerUserId);
  }

  try {
    const result =
      imageUrls.length > 1
        ? await publishInstagramCarouselPost({
            userId: params.ownerUserId,
            imageUrls,
            caption: params.caption,
          })
        : await publishInstagramPhotoPost({
            userId: params.ownerUserId,
            imageUrl: coverUrl,
            caption: params.caption,
            destination,
          });

    const mediaId = result.mediaId || result.creationId || `ig_${Date.now()}`;
    const now = new Date().toISOString();
    await admin
      .from("store_instagram_posts")
      .update({
        status: "posted",
        container_id: result.creationId,
        instagram_media_id: mediaId,
        permalink: result.username
          ? `https://www.instagram.com/${result.username}/`
          : null,
        posted_at: now,
        error_message: null,
      })
      .eq("id", postId);

    return {
      postId,
      mediaId,
      permalink: result.username
        ? `https://www.instagram.com/${result.username}/`
        : null,
      containerId: result.creationId || mediaId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to publish to Instagram.";
    await admin
      .from("store_instagram_posts")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("id", postId);
    throw error;
  }
}

export async function listInstagramPosts(ownerUserId: string, limit = 20) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("store_instagram_posts")
    .select(
      "id, prompt, caption, image_url, image_urls, status, campaign_id, day_index, scheduled_at, destination, aspect, instagram_media_id, permalink, error_message, created_at, posted_at",
    )
    .eq("user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load Instagram posts: ${error.message}`);
  }
  return data ?? [];
}
