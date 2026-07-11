import type { NestConversationDetail, NestConversationListItem } from "./types";

const MAX_CACHED_THREADS = 40;
const PERSISTED_CACHE_TTL_MS = 15 * 60 * 1000;
const STORAGE_KEY_PREFIX = "yj_nest_thread_cache_v1";
const cache = new Map<string, NestConversationDetail>();
let cacheScope = "session";
let hydratedScope: string | null = null;

type PersistedThreadCache = {
  savedAt: string;
  conversations: NestConversationDetail[];
};

function storageKey(): string {
  return `${STORAGE_KEY_PREFIX}:${cacheScope}`;
}

function hydratePersistedCache(): void {
  if (typeof window === "undefined" || hydratedScope === cacheScope) return;
  hydratedScope = cacheScope;
  cache.clear();

  try {
    const raw = window.sessionStorage.getItem(storageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedThreadCache;
    const savedMs = new Date(parsed.savedAt).getTime();
    if (
      !Number.isFinite(savedMs) ||
      Date.now() - savedMs > PERSISTED_CACHE_TTL_MS ||
      !Array.isArray(parsed.conversations)
    ) {
      window.sessionStorage.removeItem(storageKey());
      return;
    }
    for (const conversation of parsed.conversations.slice(-MAX_CACHED_THREADS)) {
      if (conversation?.chatId && Array.isArray(conversation.messages)) {
        cache.set(conversation.chatId, conversation);
      }
    }
  } catch {
    // Ignore malformed or unavailable session storage.
  }
}

function persistCache(): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedThreadCache = {
      savedAt: new Date().toISOString(),
      conversations: Array.from(cache.values()),
    };
    window.sessionStorage.setItem(storageKey(), JSON.stringify(payload));
  } catch {
    // Ignore storage quota and privacy-mode failures; the in-memory cache still works.
  }
}

export function setNestThreadCacheScope(scope: string | null | undefined): void {
  const nextScope = scope?.trim() || "session";
  if (nextScope === cacheScope) return;
  cacheScope = nextScope;
  hydratedScope = null;
  hydratePersistedCache();
}

export function getCachedNestThread(chatId: string): NestConversationDetail | null {
  hydratePersistedCache();
  const conversation = cache.get(chatId) ?? null;
  if (conversation) {
    cache.delete(chatId);
    cache.set(chatId, conversation);
  }
  return conversation;
}

export function setCachedNestThread(conversation: NestConversationDetail): void {
  hydratePersistedCache();
  cache.delete(conversation.chatId);
  cache.set(conversation.chatId, conversation);
  if (cache.size > MAX_CACHED_THREADS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  persistCache();
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
  if (getCachedNestThread(chatId) || prefetchInFlight.has(chatId)) return;
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
