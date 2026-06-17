import type { NestConversationListItem } from "@/lib/nest/types";
import { nestConversationNeedsAction } from "@/lib/nest/types";

export const NEST_LAST_CLOSED_KEY = "yj_nest_last_closed";
export const NEST_CLOSE_STATE_EVENT = "nest-close-state-changed";

let serverCloseMap: Record<string, string> = {};

export function setNestCloseMapFromServer(map: Record<string, string>) {
  const local = readNestCloseMap();
  const merged: Record<string, string> = { ...map };
  for (const [chatId, localTs] of Object.entries(local)) {
    const serverTs = merged[chatId];
    if (!serverTs || new Date(localTs).getTime() > new Date(serverTs).getTime()) {
      merged[chatId] = localTs;
    }
  }

  const unchanged =
    Object.keys(merged).length === Object.keys(serverCloseMap).length &&
    Object.entries(merged).every(([chatId, iso]) => serverCloseMap[chatId] === iso);
  if (unchanged) return;

  serverCloseMap = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(NEST_LAST_CLOSED_KEY, JSON.stringify(serverCloseMap));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(NEST_CLOSE_STATE_EVENT));
  }
}

export function readNestCloseMap(): Record<string, string> {
  if (Object.keys(serverCloseMap).length > 0) {
    return { ...serverCloseMap };
  }
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NEST_LAST_CLOSED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeNestClose(chatId: string, iso: string) {
  const map = readNestCloseMap();
  map[chatId] = iso;
  serverCloseMap = { ...map };
  if (typeof window === "undefined") return;
  localStorage.setItem(NEST_LAST_CLOSED_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(NEST_CLOSE_STATE_EVENT));
}

export function clearNestClose(chatId: string) {
  const map = readNestCloseMap();
  if (!map[chatId]) return;
  delete map[chatId];
  serverCloseMap = { ...map };
  if (typeof window === "undefined") return;
  localStorage.setItem(NEST_LAST_CLOSED_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(NEST_CLOSE_STATE_EVENT));
}

export function nestCloseAnchor(
  chat: Pick<NestConversationListItem, "lastCustomerMessageAt" | "lastMessageAt" | "previewRole">,
): string {
  return (
    chat.lastCustomerMessageAt ||
    (chat.previewRole === "user" ? chat.lastMessageAt : null) ||
    chat.lastMessageAt ||
    new Date().toISOString()
  );
}

export function markNestConversationClosed(
  chat: Pick<
    NestConversationListItem,
    "chatId" | "lastCustomerMessageAt" | "lastMessageAt" | "previewRole"
  >,
  closedAt = new Date().toISOString(),
) {
  writeNestClose(chat.chatId, closedAt);
}

export function markNestConversationReopened(chatId: string) {
  clearNestClose(chatId);
}

export function isNestConversationClosed(
  chat: Pick<
    NestConversationListItem,
    | "chatId"
    | "previewRole"
    | "lastCustomerMessageAt"
    | "latestManualMessageAt"
    | "hasManualMessages"
    | "lastMessageAt"
  >,
): boolean {
  const closedAt = readNestCloseMap()[chat.chatId];
  if (!closedAt) return false;
  return !nestConversationNeedsAction(chat, closedAt);
}

export function buildNestClosePayload(
  chats: NestConversationListItem[],
): Array<{ chatId: string; closedAt: string }> {
  return chats.map((chat) => ({
    chatId: chat.chatId,
    closedAt: nestCloseAnchor(chat),
  }));
}
