import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";

export const GMAIL_INQUIRY_LAST_READ_KEY = "yj_gmail_inquiry_last_read";
export const GMAIL_INQUIRY_READ_STATE_EVENT = "gmail-inquiry-read-state-changed";

let serverReadMap: Record<string, string> = {};

function toMillis(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function mergeReadMaps(
  base: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const merged = { ...base };
  for (const [id, incomingTs] of Object.entries(incoming)) {
    if (toMillis(incomingTs) > toMillis(merged[id])) {
      merged[id] = incomingTs;
    }
  }
  return merged;
}

function persistReadMap(map: Record<string, string>) {
  serverReadMap = { ...map };
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GMAIL_INQUIRY_LAST_READ_KEY, JSON.stringify(serverReadMap));
  } catch {
    // ignore quota errors
  }
  window.dispatchEvent(new CustomEvent(GMAIL_INQUIRY_READ_STATE_EVENT));
}

export function setGmailInquiryReadMapFromServer(map: Record<string, string>) {
  const local = readGmailInquiryLastReadMap();
  const merged = mergeReadMaps(map, local);
  const unchanged =
    Object.keys(merged).length === Object.keys(serverReadMap).length &&
    Object.entries(merged).every(([id, iso]) => serverReadMap[id] === iso);
  if (unchanged) return;

  persistReadMap(merged);
}

/** Stable customer-activity anchor — ignores sync bumps on updated_at. */
export function gmailInquiryReadAnchor(
  item: Pick<CustomerInquiryListItem, "last_customer_at" | "received_at">,
): string | null {
  return item.last_customer_at || item.received_at || null;
}

export function readGmailInquiryLastReadMap(): Record<string, string> {
  if (Object.keys(serverReadMap).length > 0) {
    return { ...serverReadMap };
  }
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GMAIL_INQUIRY_LAST_READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeGmailInquiryLastRead(inquiryId: string, anchor: string): boolean {
  const map = readGmailInquiryLastReadMap();
  if (toMillis(map[inquiryId]) >= toMillis(anchor)) {
    return false;
  }
  map[inquiryId] = anchor;
  persistReadMap(map);
  return true;
}

export function isGmailInquiryUnread(item: CustomerInquiryListItem): boolean {
  const anchor = gmailInquiryReadAnchor(item);
  if (!anchor) return false;
  const lastRead = readGmailInquiryLastReadMap()[item.id];
  if (!lastRead) return true;
  return toMillis(anchor) > toMillis(lastRead);
}

function persistGmailReadToServer(inquiryId: string, anchor: string) {
  void import("@/lib/customer-inquiries/unified-inbox-client")
    .then(({ markGmailInquiryReadOnServer }) => markGmailInquiryReadOnServer(inquiryId, anchor))
    .catch(() => {});
}

/**
 * Mark a Gmail enquiry read up to its customer-activity anchor (idempotent).
 * Returns true when local state advanced.
 */
export function markGmailInquiryRead(
  item: CustomerInquiryListItem,
  explicitAnchor?: string | null,
) {
  const anchor = explicitAnchor || gmailInquiryReadAnchor(item);
  if (!anchor) return false;

  writeGmailInquiryLastRead(item.id, anchor);
  // Always re-post the effective high-water mark so a failed earlier write can catch up.
  const effective = readGmailInquiryLastReadMap()[item.id] ?? anchor;
  persistGmailReadToServer(item.id, effective);
  return true;
}

export function markAllGmailInquiriesRead(inquiries: CustomerInquiryListItem[]) {
  if (typeof window === "undefined") return;
  const map = readGmailInquiryLastReadMap();
  for (const item of inquiries) {
    const anchor = gmailInquiryReadAnchor(item);
    if (anchor && toMillis(anchor) > toMillis(map[item.id])) {
      map[item.id] = anchor;
    }
  }
  persistReadMap(map);
}

export function buildGmailInquiryReadPayload(
  inquiries: CustomerInquiryListItem[],
): Array<{ inquiryId: string; lastReadAt: string }> {
  return inquiries.flatMap((item) => {
    const anchor = gmailInquiryReadAnchor(item);
    return anchor ? [{ inquiryId: item.id, lastReadAt: anchor }] : [];
  });
}
