import type { GoogleReviewItem } from "@/lib/customer-inquiries/google-review-types";

/**
 * Local-only read state for Google reviews. Reviews live in the GBP API (not
 * Supabase), so the unread high-water mark is kept in localStorage per browser.
 */

export const GOOGLE_REVIEW_LAST_READ_KEY = "yj_google_review_last_read";
export const GOOGLE_REVIEW_READ_STATE_EVENT = "google-review-read-state-changed";

function toMillis(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function readGoogleReviewLastReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GOOGLE_REVIEW_LAST_READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistReadMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GOOGLE_REVIEW_LAST_READ_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
  window.dispatchEvent(new CustomEvent(GOOGLE_REVIEW_READ_STATE_EVENT));
}

/** Unread anchor — review update time (covers new reviews and reply edits). */
export function googleReviewReadAnchor(
  review: Pick<GoogleReviewItem, "update_time" | "create_time">,
): string | null {
  return review.update_time || review.create_time || null;
}

/**
 * Unread when there is no store reply yet and the review is newer than the
 * last-read watermark.
 */
export function isGoogleReviewUnread(review: GoogleReviewItem): boolean {
  if (review.reply) return false;
  const anchor = googleReviewReadAnchor(review);
  if (!anchor) return false;
  const lastRead = readGoogleReviewLastReadMap()[review.review_id];
  if (!lastRead) return true;
  return toMillis(anchor) > toMillis(lastRead);
}

export function markGoogleReviewRead(
  review: Pick<GoogleReviewItem, "review_id" | "update_time" | "create_time">,
  explicitAnchor?: string | null,
): boolean {
  const anchor = explicitAnchor || googleReviewReadAnchor(review);
  if (!anchor) return false;
  const map = readGoogleReviewLastReadMap();
  if (toMillis(map[review.review_id]) >= toMillis(anchor)) {
    return false;
  }
  map[review.review_id] = anchor;
  persistReadMap(map);
  return true;
}

export function markAllGoogleReviewsRead(reviews: GoogleReviewItem[]) {
  if (typeof window === "undefined") return;
  const map = readGoogleReviewLastReadMap();
  let changed = false;
  for (const review of reviews) {
    const anchor = googleReviewReadAnchor(review);
    if (anchor && toMillis(anchor) > toMillis(map[review.review_id])) {
      map[review.review_id] = anchor;
      changed = true;
    }
  }
  if (changed) persistReadMap(map);
}
