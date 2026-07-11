import type { GoogleReviewsResponse } from "@/lib/customer-inquiries/google-review-types";
import type { GoogleReviewReply } from "@/lib/customer-inquiries/google-review-types";

export async function fetchGoogleReviewsInbox(options?: {
  forceRefresh?: boolean;
}): Promise<GoogleReviewsResponse> {
  const url = options?.forceRefresh
    ? "/api/store/google-reviews?refresh=1"
    : "/api/store/google-reviews";
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as GoogleReviewsResponse;
  if (!res.ok && !data.reviews) {
    throw new Error(data.error || "Could not load Google reviews.");
  }
  return data;
}

export async function replyToGoogleReviewOnServer(payload: {
  reviewName: string;
  reviewId: string;
  comment: string;
}): Promise<{ reply: GoogleReviewReply; replied_at: string }> {
  const res = await fetch("/api/store/google-reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "reply",
      review_name: payload.reviewName,
      review_id: payload.reviewId,
      comment: payload.comment,
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    reply?: GoogleReviewReply;
    replied_at?: string;
    error?: string;
  };
  if (!res.ok || !data.reply) {
    throw new Error(data.error || "Could not post Google review reply.");
  }
  return {
    reply: data.reply,
    replied_at: data.replied_at ?? new Date().toISOString(),
  };
}
