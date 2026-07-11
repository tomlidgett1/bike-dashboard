/**
 * Client-safe Google Business Profile review types shared between the
 * /api/store/google-reviews route and the unified inbox UI.
 */

export type GoogleStarRating = 1 | 2 | 3 | 4 | 5;

export type GoogleReviewReply = {
  comment: string;
  update_time: string | null;
};

export type GoogleReviewItem = {
  /** Stable id used as the inbox row key (reviewId from GBP). */
  review_id: string;
  /** Full resource name: accounts/.../locations/.../reviews/... */
  name: string;
  reviewer_name: string;
  reviewer_photo_url: string | null;
  is_anonymous: boolean;
  star_rating: GoogleStarRating | null;
  comment: string;
  create_time: string | null;
  update_time: string | null;
  reply: GoogleReviewReply | null;
};

export type GoogleBusinessConnectionPublic = {
  oauthConfigured: boolean;
  connected: boolean;
  needsLocation: boolean;
  status: string;
  googleEmail: string | null;
  googleName: string | null;
  accountId: string | null;
  locationId: string | null;
  accountName: string | null;
  locationName: string | null;
  reviewUrl: string | null;
  mapsUri: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

export type GoogleReviewsState = {
  /** OAuth client configured and/or a usable auth path exists. */
  configured: boolean;
  /** Reviews can be listed for a selected location. */
  connected: boolean;
  /** Env var names still needed (never secret values). */
  missing_env: string[];
  setup_hint: string | null;
  average_rating: number | null;
  total_review_count: number | null;
  connection?: GoogleBusinessConnectionPublic | null;
};

export type GoogleReviewsResponse = GoogleReviewsState & {
  reviews: GoogleReviewItem[];
  cached?: boolean;
  error?: string;
};
