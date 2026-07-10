import type { NestConversationListItem } from "@/lib/nest/types";

export const NEST_LAST_READ_KEY = "yj_nest_last_read";
export const NEST_READ_STATE_EVENT = "nest-read-state-changed";

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
  for (const [chatId, incomingTs] of Object.entries(incoming)) {
    if (toMillis(incomingTs) > toMillis(merged[chatId])) {
      merged[chatId] = incomingTs;
    }
  }
  return merged;
}

function persistReadMap(map: Record<string, string>) {
  serverReadMap = { ...map };
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NEST_LAST_READ_KEY, JSON.stringify(serverReadMap));
  } catch {
    // ignore quota errors
  }
  window.dispatchEvent(new CustomEvent(NEST_READ_STATE_EVENT));
}

export function setNestReadMapFromServer(map: Record<string, string>) {
  const local = readNestLastReadMap();
  const merged = mergeReadMaps(map, local);
  const unchanged =
    Object.keys(merged).length === Object.keys(serverReadMap).length &&
    Object.entries(merged).every(([chatId, iso]) => serverReadMap[chatId] === iso);
  if (unchanged) return;
  persistReadMap(merged);
}

/** Stable unread anchor — prefer last customer activity, fall back to latest message. */
export function nestConversationReadAnchor(
  chat: Pick<NestConversationListItem, "lastCustomerMessageAt" | "lastMessageAt">,
): string | null {
  return chat.lastCustomerMessageAt || chat.lastMessageAt || null;
}

export function readNestLastReadMap(): Record<string, string> {
  if (Object.keys(serverReadMap).length > 0) {
    return { ...serverReadMap };
  }
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NEST_LAST_READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeNestLastRead(chatId: string, iso: string) {
  const map = readNestLastReadMap();
  if (toMillis(map[chatId]) >= toMillis(iso)) {
    return false;
  }
  map[chatId] = iso;
  persistReadMap(map);
  return true;
}

export function isNestConversationUnread(chat: NestConversationListItem): boolean {
  const anchor = nestConversationReadAnchor(chat);
  if (!anchor) return false;
  const lastRead = readNestLastReadMap()[chat.chatId];
  if (!lastRead) return true;
  return toMillis(anchor) > toMillis(lastRead);
}

function persistNestReadToServer(chatId: string, anchor: string) {
  void import("@/lib/customer-inquiries/unified-inbox-client")
    .then(({ markNestReadOnServer }) => markNestReadOnServer(chatId, anchor))
    .catch(() => {});
}

/**
 * Mark a Nest conversation read up to `anchor` (idempotent — never moves backwards).
 * Returns true when local state advanced.
 */
export function markNestConversationRead(
  chat: Pick<NestConversationListItem, "chatId" | "lastCustomerMessageAt" | "lastMessageAt">,
  explicitAnchor?: string | null,
) {
  const anchor = explicitAnchor || nestConversationReadAnchor(chat);
  if (!anchor) return false;

  const advanced = writeNestLastRead(chat.chatId, anchor);
  // Always re-post the effective high-water mark so a failed earlier write can catch up.
  const effective = readNestLastReadMap()[chat.chatId] ?? anchor;
  persistNestReadToServer(chat.chatId, effective);
  return advanced;
}

export function markAllNestConversationsRead(chats: NestConversationListItem[]) {
  if (typeof window === "undefined") return;
  const map = readNestLastReadMap();
  for (const chat of chats) {
    const anchor = nestConversationReadAnchor(chat);
    if (anchor && toMillis(anchor) > toMillis(map[chat.chatId])) {
      map[chat.chatId] = anchor;
    }
  }
  persistReadMap(map);
}

export function buildNestReadPayload(
  chats: NestConversationListItem[],
): Array<{ chatId: string; lastReadAt: string }> {
  return chats.flatMap((chat) => {
    const anchor = nestConversationReadAnchor(chat);
    return anchor ? [{ chatId: chat.chatId, lastReadAt: anchor }] : [];
  });
}
