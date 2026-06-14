import type { NestConversationDetail, NestConversationListItem } from "./types";

const MAX_CACHED_THREADS = 40;
const cache = new Map<string, NestConversationDetail>();

export function getCachedNestThread(chatId: string): NestConversationDetail | null {
  return cache.get(chatId) ?? null;
}

export function setCachedNestThread(conversation: NestConversationDetail): void {
  cache.set(conversation.chatId, conversation);
  if (cache.size <= MAX_CACHED_THREADS) return;

  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

export function buildStubNestConversation(chat: NestConversationListItem): NestConversationDetail {
  return {
    chatId: chat.chatId,
    title: chat.title,
    displayName: chat.displayName,
    participantHandle: chat.participantHandle,
    source: chat.source,
    lastSeen: null,
    messages: [],
  };
}

export function mergeNestThreadFromList(
  conversation: NestConversationDetail,
  chat: NestConversationListItem | undefined,
): NestConversationDetail {
  if (!chat) return conversation;
  return {
    ...conversation,
    displayName: conversation.displayName || chat.displayName,
    title: chat.title || conversation.title,
    participantHandle: conversation.participantHandle || chat.participantHandle,
  };
}

const prefetchInFlight = new Set<string>();

export function prefetchNestThread(
  chatId: string,
  fetchThread: (chatId: string) => Promise<NestConversationDetail | null>,
): void {
  if (cache.has(chatId) || prefetchInFlight.has(chatId)) return;
  prefetchInFlight.add(chatId);
  void fetchThread(chatId)
    .then((conversation) => {
      if (conversation) setCachedNestThread(conversation);
    })
    .catch(() => {})
    .finally(() => {
      prefetchInFlight.delete(chatId);
    });
}
