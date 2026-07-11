import type { InstagramConversationItem } from "@/lib/customer-inquiries/instagram-types";

/**
 * Local-only read state for Instagram DM conversations, mirroring the Nest
 * read-map pattern. Instagram threads live in the Graph API (not Supabase),
 * so the unread high-water mark is kept in localStorage per browser.
 */

export const INSTAGRAM_LAST_READ_KEY = "yj_instagram_last_read";
export const INSTAGRAM_READ_STATE_EVENT = "instagram-read-state-changed";

function toMillis(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function readInstagramLastReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(INSTAGRAM_LAST_READ_KEY);
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
    localStorage.setItem(INSTAGRAM_LAST_READ_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
  window.dispatchEvent(new CustomEvent(INSTAGRAM_READ_STATE_EVENT));
}

/** Stable unread anchor — last customer activity, falling back to latest message. */
export function instagramConversationReadAnchor(
  conversation: Pick<InstagramConversationItem, "last_customer_at" | "updated_at">,
): string | null {
  return conversation.last_customer_at || conversation.updated_at || null;
}

export function isInstagramConversationUnread(
  conversation: InstagramConversationItem,
): boolean {
  if (conversation.preview_role !== "customer") return false;
  const anchor = instagramConversationReadAnchor(conversation);
  if (!anchor) return false;
  const lastRead = readInstagramLastReadMap()[conversation.conversation_id];
  if (!lastRead) return true;
  return toMillis(anchor) > toMillis(lastRead);
}

/** Mark read up to `anchor` (idempotent — never moves backwards). */
export function markInstagramConversationRead(
  conversation: Pick<
    InstagramConversationItem,
    "conversation_id" | "last_customer_at" | "updated_at"
  >,
  explicitAnchor?: string | null,
): boolean {
  const anchor = explicitAnchor || instagramConversationReadAnchor(conversation);
  if (!anchor) return false;
  const map = readInstagramLastReadMap();
  if (toMillis(map[conversation.conversation_id]) >= toMillis(anchor)) {
    return false;
  }
  map[conversation.conversation_id] = anchor;
  persistReadMap(map);
  return true;
}

export function markAllInstagramConversationsRead(
  conversations: InstagramConversationItem[],
) {
  if (typeof window === "undefined") return;
  const map = readInstagramLastReadMap();
  let changed = false;
  for (const conversation of conversations) {
    const anchor = instagramConversationReadAnchor(conversation);
    if (anchor && toMillis(anchor) > toMillis(map[conversation.conversation_id])) {
      map[conversation.conversation_id] = anchor;
      changed = true;
    }
  }
  if (changed) persistReadMap(map);
}
