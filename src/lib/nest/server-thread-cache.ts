import type { NestConversationDetail } from "./types";

const THREAD_CACHE_TTL_MS = 45_000;
const MAX_ENTRIES = 200;

type CacheEntry = {
  expiresAt: number;
  conversation: NestConversationDetail;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(brandKey: string, chatId: string): string {
  return `${brandKey}:${chatId}`;
}

export function getServerNestThreadCache(
  brandKey: string,
  chatId: string,
): NestConversationDetail | null {
  const entry = cache.get(cacheKey(brandKey, chatId));
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(cacheKey(brandKey, chatId));
    return null;
  }
  return entry.conversation;
}

export function setServerNestThreadCache(
  brandKey: string,
  chatId: string,
  conversation: NestConversationDetail,
): void {
  cache.set(cacheKey(brandKey, chatId), {
    expiresAt: Date.now() + THREAD_CACHE_TTL_MS,
    conversation,
  });

  if (cache.size <= MAX_ENTRIES) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

export function invalidateServerNestThreadCache(brandKey: string, chatId: string): void {
  cache.delete(cacheKey(brandKey, chatId));
}
