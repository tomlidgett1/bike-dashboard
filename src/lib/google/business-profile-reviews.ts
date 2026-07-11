/**
 * Google Business Profile Reviews API (legacy My Business v4).
 *
 * List:  GET  mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews
 * Reply: PUT  mybusiness.googleapis.com/v4/{review.name}/reply
 *
 * Auth preference:
 *   1. Per-store OAuth connection (Connect Google Business)
 *   2. Fallback: service-account env (GOOGLE_SERVICE_ACCOUNT_JSON + GBP_* IDs)
 */

import type {
  GoogleReviewItem,
  GoogleReviewReply,
  GoogleStarRating,
} from "@/lib/customer-inquiries/google-review-types";
import {
  BUSINESS_SCOPE,
  gbpAccountId,
  gbpLocationId,
  getGoogleBusinessAccessToken,
  googleBusinessProfileConfigStatus,
} from "@/lib/google/business-profile-auth";
import { getStoreGoogleBusinessAccessToken } from "@/lib/google/business-oauth-connection";

const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

const STAR_MAP: Record<string, GoogleStarRating> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

type GbpReviewer = {
  displayName?: string;
  profilePhotoUrl?: string;
  isAnonymous?: boolean;
};

type GbpReviewReply = {
  comment?: string;
  updateTime?: string;
};

type GbpReview = {
  name?: string;
  reviewId?: string;
  reviewer?: GbpReviewer;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: GbpReviewReply;
};

type GbpReviewsListResponse = {
  reviews?: GbpReview[];
  averageRating?: number;
  totalReviewCount?: number;
  nextPageToken?: string;
};

export type GoogleReviewsAuthContext = {
  accessToken: string;
  accountId: string;
  locationId: string;
  source: "oauth" | "service_account";
};

function mapReply(reply: GbpReviewReply | undefined): GoogleReviewReply | null {
  const comment = reply?.comment?.trim();
  if (!comment) return null;
  return {
    comment,
    update_time: reply?.updateTime ?? null,
  };
}

function mapReview(
  raw: GbpReview,
  accountId: string,
  locationId: string,
): GoogleReviewItem | null {
  const reviewId = raw.reviewId?.trim() || raw.name?.split("/").pop()?.trim();
  if (!reviewId) return null;
  const name =
    raw.name?.trim() ||
    `accounts/${accountId}/locations/${locationId}/reviews/${reviewId}`;

  const star = raw.starRating ? STAR_MAP[raw.starRating] ?? null : null;
  const reviewerName =
    raw.reviewer?.displayName?.trim() ||
    (raw.reviewer?.isAnonymous ? "Anonymous" : "Google reviewer");

  return {
    review_id: reviewId,
    name,
    reviewer_name: reviewerName,
    reviewer_photo_url: raw.reviewer?.profilePhotoUrl?.trim() || null,
    is_anonymous: Boolean(raw.reviewer?.isAnonymous),
    star_rating: star ?? null,
    comment: (raw.comment ?? "").trim(),
    create_time: raw.createTime ?? null,
    update_time: raw.updateTime ?? null,
    reply: mapReply(raw.reviewReply),
  };
}

/**
 * Resolve auth for reviews: store OAuth first, then service-account env fallback.
 */
export async function resolveGoogleReviewsAuth(
  userId: string,
): Promise<GoogleReviewsAuthContext | null> {
  const oauth = await getStoreGoogleBusinessAccessToken(userId);
  if (oauth) {
    return {
      accessToken: oauth.accessToken,
      accountId: oauth.accountId,
      locationId: oauth.locationId,
      source: "oauth",
    };
  }

  const status = googleBusinessProfileConfigStatus();
  if (!status.ok) return null;
  const token = await getGoogleBusinessAccessToken([BUSINESS_SCOPE]);
  const accountId = gbpAccountId();
  const locationId = gbpLocationId();
  if (!token || !accountId || !locationId) return null;
  return {
    accessToken: token,
    accountId,
    locationId,
    source: "service_account",
  };
}

export type ListGoogleReviewsResult = {
  reviews: GoogleReviewItem[];
  average_rating: number | null;
  total_review_count: number | null;
};

export async function listGoogleBusinessReviews(
  auth: GoogleReviewsAuthContext,
  options?: { pageSize?: number; maxPages?: number },
): Promise<ListGoogleReviewsResult> {
  const pageSize = Math.min(Math.max(options?.pageSize ?? 50, 1), 50);
  const maxPages = Math.min(Math.max(options?.maxPages ?? 3, 1), 10);
  const reviews: GoogleReviewItem[] = [];
  let average: number | null = null;
  let total: number | null = null;
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      orderBy: "updateTime desc",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${REVIEWS_API}/accounts/${auth.accountId}/locations/${auth.locationId}/reviews?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      throw new Error(`Google reviews list failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as GbpReviewsListResponse;
    if (typeof data.averageRating === "number") average = data.averageRating;
    if (typeof data.totalReviewCount === "number") total = data.totalReviewCount;

    for (const raw of data.reviews ?? []) {
      const mapped = mapReview(raw, auth.accountId, auth.locationId);
      if (mapped) reviews.push(mapped);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return {
    reviews,
    average_rating: average,
    total_review_count: total,
  };
}

export async function replyToGoogleBusinessReview(payload: {
  auth: GoogleReviewsAuthContext;
  reviewName: string;
  comment: string;
}): Promise<GoogleReviewReply> {
  const comment = payload.comment.trim();
  if (!comment) throw new Error("Reply cannot be empty.");
  if (comment.length > 4096) {
    throw new Error("Reply is too long (Google allows up to 4096 characters).");
  }

  const name = payload.reviewName.trim();
  if (!name.startsWith("accounts/") || !name.includes("/reviews/")) {
    throw new Error("Invalid Google review resource name.");
  }

  const res = await fetch(`${REVIEWS_API}/${name}/reply`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${payload.auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`Google review reply failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GbpReviewReply;
  return {
    comment: data.comment?.trim() || comment,
    update_time: data.updateTime ?? new Date().toISOString(),
  };
}
