import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";

export const GMAIL_INQUIRY_LAST_READ_KEY = "yj_gmail_inquiry_last_read";
export const GMAIL_INQUIRY_READ_STATE_EVENT = "gmail-inquiry-read-state-changed";

let serverReadMap: Record<string, string> = {};

function mergeReadMaps(
  base: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const merged = { ...base };
  for (const [id, incomingTs] of Object.entries(incoming)) {
    const existingTs = merged[id];
    if (!existingTs || new Date(incomingTs).getTime() > new Date(existingTs).getTime()) {
      merged[id] = incomingTs;
    }
  }
  return merged;
}

export function setGmailInquiryReadMapFromServer(map: Record<string, string>) {
  const local = readGmailInquiryLastReadMap();
  const merged = mergeReadMaps(map, local);
  const unchanged =
    Object.keys(merged).length === Object.keys(serverReadMap).length &&
    Object.entries(merged).every(([id, iso]) => serverReadMap[id] === iso);
  if (unchanged) return;

  serverReadMap = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(GMAIL_INQUIRY_LAST_READ_KEY, JSON.stringify(serverReadMap));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(GMAIL_INQUIRY_READ_STATE_EVENT));
  }
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

function writeGmailInquiryLastReadMap(map: Record<string, string>) {
  serverReadMap = { ...map };
  if (typeof window === "undefined") return;
  localStorage.setItem(GMAIL_INQUIRY_LAST_READ_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(GMAIL_INQUIRY_READ_STATE_EVENT));
}

function writeGmailInquiryLastRead(inquiryId: string, anchor: string) {
  const map = readGmailInquiryLastReadMap();
  const existing = map[inquiryId];
  if (existing && new Date(existing).getTime() >= new Date(anchor).getTime()) {
    return;
  }
  map[inquiryId] = anchor;
  writeGmailInquiryLastReadMap(map);
}

export function isGmailInquiryUnread(item: CustomerInquiryListItem): boolean {
  const anchor = gmailInquiryReadAnchor(item);
  if (!anchor) return false;
  const lastRead = readGmailInquiryLastReadMap()[item.id];
  if (!lastRead) return true;
  return new Date(anchor).getTime() > new Date(lastRead).getTime();
}

export function markGmailInquiryRead(item: CustomerInquiryListItem) {
  const anchor = gmailInquiryReadAnchor(item);
  if (!anchor) return;

  const existing = readGmailInquiryLastReadMap()[item.id];
  if (existing && new Date(existing).getTime() >= new Date(anchor).getTime()) {
    return;
  }

  writeGmailInquiryLastRead(item.id, anchor);
  void import("@/lib/customer-inquiries/unified-inbox-client")
    .then(({ markGmailInquiryReadOnServer }) => markGmailInquiryReadOnServer(item.id, anchor))
    .catch(() => {});
}

export function markAllGmailInquiriesRead(inquiries: CustomerInquiryListItem[]) {
  if (typeof window === "undefined") return;
  const map = readGmailInquiryLastReadMap();
  for (const item of inquiries) {
    const anchor = gmailInquiryReadAnchor(item);
    if (anchor) map[item.id] = anchor;
  }
  writeGmailInquiryLastReadMap(map);
}

export function buildGmailInquiryReadPayload(
  inquiries: CustomerInquiryListItem[],
): Array<{ inquiryId: string; lastReadAt: string }> {
  return inquiries.flatMap((item) => {
    const anchor = gmailInquiryReadAnchor(item);
    return anchor ? [{ inquiryId: item.id, lastReadAt: anchor }] : [];
  });
}
