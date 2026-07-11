import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import type { GoogleReviewsResponse } from "@/lib/customer-inquiries/google-review-types";
import { googleBusinessOAuthConfigured } from "@/lib/google/business-oauth-config";
import {
  getGoogleBusinessConnection,
  toPublicGoogleBusinessStatus,
} from "@/lib/google/business-oauth-connection";
import { googleBusinessProfileConfigStatus } from "@/lib/google/business-profile-auth";
import {
  listGoogleBusinessReviews,
  replyToGoogleBusinessReview,
  resolveGoogleReviewsAuth,
} from "@/lib/google/business-profile-reviews";

export const dynamic = "force-dynamic";

const INBOX_CACHE_TTL_MS = 60 * 1000;
const inboxCache = new Map<
  string,
  { payload: GoogleReviewsResponse; fetchedAt: number }
>();

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const CONNECT_HINT =
  "Connect Google Business in Customer Enquiries to load and reply to reviews.";

async function buildInboxPayload(userId: string): Promise<GoogleReviewsResponse> {
  const connection = await getGoogleBusinessConnection(userId);
  const publicStatus = toPublicGoogleBusinessStatus(connection);
  const auth = await resolveGoogleReviewsAuth(userId);

  if (!auth) {
    const oauthReady = googleBusinessOAuthConfigured();
    const saStatus = googleBusinessProfileConfigStatus();
    const needsLocation = publicStatus.needsLocation;
    return {
      configured: oauthReady || saStatus.ok,
      connected: false,
      missing_env: oauthReady
        ? []
        : saStatus.missing.length
          ? saStatus.missing
          : ["GOOGLE_BUSINESS_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_SECRET"],
      setup_hint: needsLocation
        ? "Choose which Google Business location to use."
        : CONNECT_HINT,
      average_rating: null,
      total_review_count: null,
      reviews: [],
      connection: publicStatus,
    } as GoogleReviewsResponse & { connection: typeof publicStatus };
  }

  const listed = await listGoogleBusinessReviews(auth, { pageSize: 50, maxPages: 3 });
  return {
    configured: true,
    connected: true,
    missing_env: [],
    setup_hint: null,
    average_rating: listed.average_rating,
    total_review_count: listed.total_review_count,
    reviews: listed.reviews,
    connection: publicStatus,
  } as GoogleReviewsResponse & { connection: typeof publicStatus };
}

async function resolveInboxPayload(options: {
  forceRefresh?: boolean;
  userId: string;
}): Promise<GoogleReviewsResponse> {
  const cacheKey = options.userId;
  if (!options.forceRefresh) {
    const cached = inboxCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < INBOX_CACHE_TTL_MS) {
      return { ...cached.payload, cached: true };
    }
  }

  const payload = await buildInboxPayload(options.userId);
  inboxCache.set(cacheKey, { payload, fetchedAt: Date.now() });
  return payload;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const payload = await resolveInboxPayload({
      forceRefresh,
      userId: auth.user.id,
    });
    return json(payload);
  } catch (error) {
    console.error("[google-reviews] GET failed:", error);
    return json(
      {
        configured: googleBusinessOAuthConfigured(),
        connected: false,
        missing_env: [],
        setup_hint: CONNECT_HINT,
        average_rating: null,
        total_review_count: null,
        reviews: [],
        error:
          error instanceof Error ? error.message : "Could not load Google reviews.",
      },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireStoreUser();
    if ("error" in authResult) return authResult.error;

    const body = (await request.json()) as {
      action?: string;
      review_name?: string;
      review_id?: string;
      comment?: string;
    };

    if (body.action !== "reply") {
      return json({ error: "Unknown action." }, 400);
    }

    const comment = body.comment?.trim() ?? "";
    const reviewName = body.review_name?.trim() ?? "";
    if (!reviewName || !comment) {
      return json({ error: "review_name and comment are required." }, 400);
    }

    const reviewsAuth = await resolveGoogleReviewsAuth(authResult.user.id);
    if (!reviewsAuth) {
      return json(
        {
          error: CONNECT_HINT,
        },
        400,
      );
    }

    const reply = await replyToGoogleBusinessReview({
      auth: reviewsAuth,
      reviewName,
      comment,
    });

    inboxCache.delete(authResult.user.id);

    return json({
      ok: true,
      reply,
      review_id: body.review_id ?? reviewName.split("/").pop() ?? null,
      replied_at: reply.update_time ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("[google-reviews] POST failed:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Could not post Google review reply.",
      },
      500,
    );
  }
}
