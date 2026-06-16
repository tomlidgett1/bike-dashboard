import type { NestConversationListItem } from "@/lib/nest/types";

export const NEST_LAST_READ_KEY = "yj_nest_last_read";
export const NEST_READ_STATE_EVENT = "nest-read-state-changed";

let serverReadMap: Record<string, string> = {};

export function setNestReadMapFromServer(map: Record<string, string>) {
  const local = readNestLastReadMap();
  const merged: Record<string, string> = { ...map };
  for (const [chatId, localTs] of Object.entries(local)) {
    const serverTs = merged[chatId];
    if (!serverTs || new Date(localTs).getTime() > new Date(serverTs).getTime()) {
      merged[chatId] = localTs;
    }
  }

  const unchanged =
    Object.keys(merged).length === Object.keys(serverReadMap).length &&
    Object.entries(merged).every(([chatId, iso]) => serverReadMap[chatId] === iso);
  if (unchanged) return;

  serverReadMap = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(NEST_LAST_READ_KEY, JSON.stringify(serverReadMap));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(NEST_READ_STATE_EVENT));
  }
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
  const existing = map[chatId];
  if (existing && new Date(existing).getTime() >= new Date(iso).getTime()) {
    return;
  }

  serverReadMap[chatId] = iso;
  if (typeof window === "undefined") return;
  map[chatId] = iso;
  localStorage.setItem(NEST_LAST_READ_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(NEST_READ_STATE_EVENT));
}

export function isNestConversationUnread(chat: NestConversationListItem): boolean {
  const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
  if (!anchor) return false;
  const lastRead = readNestLastReadMap()[chat.chatId];
  if (!lastRead) return true;
  return new Date(anchor).getTime() > new Date(lastRead).getTime();
}

export function markNestConversationRead(
  chat: Pick<NestConversationListItem, "chatId" | "lastCustomerMessageAt" | "lastMessageAt">,
) {
  const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
  if (!anchor) return;

  const existing = readNestLastReadMap()[chat.chatId];
  if (existing && new Date(existing).getTime() >= new Date(anchor).getTime()) {
    return;
  }

  writeNestLastRead(chat.chatId, anchor);
  void import("@/lib/customer-inquiries/unified-inbox-client")
    .then(({ markNestReadOnServer }) => markNestReadOnServer(chat.chatId, anchor))
    .catch(() => {});
}

export function markAllNestConversationsRead(chats: NestConversationListItem[]) {
  if (typeof window === "undefined") return;
  const map = readNestLastReadMap();
  for (const chat of chats) {
    const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
    if (anchor) map[chat.chatId] = anchor;
  }
  serverReadMap = { ...map };
  localStorage.setItem(NEST_LAST_READ_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(NEST_READ_STATE_EVENT));
}

export function buildNestReadPayload(
  chats: NestConversationListItem[],
): Array<{ chatId: string; lastReadAt: string }> {
  return chats.flatMap((chat) => {
    const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
    return anchor ? [{ chatId: chat.chatId, lastReadAt: anchor }] : [];
  });
}
