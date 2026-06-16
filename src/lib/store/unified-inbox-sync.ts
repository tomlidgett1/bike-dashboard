import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichNestChatsWithLightspeed,
  enrichNestConversationWithLightspeed,
} from "@/lib/nest/enrich-chats-with-lightspeed";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import {
  loadNestChatsFromSupabase,
  loadNestThreadSyncState,
  touchNestSyncTimestamp,
  upsertNestChatsToSupabase,
  upsertNestThreadToSupabase,
  type NestThreadSyncState,
} from "@/lib/nest/inbox-supabase";
import {
  enrichNestChatsWithTwilioMissedCalls,
  fetchNestTwilioMissedCallChatIds,
} from "@/lib/nest/twilio-missed-calls";
import type { NestConversationDetail, NestConversationListItem } from "@/lib/nest/types";
import { isNestPortalTestChat } from "@/lib/nest/types";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import { reconcileAnsweredThreads } from "@/lib/customer-inquiries/sync";
import { isComposioConfigured, listGmailConnections } from "@/lib/composio/gmail";

type NestSyncOptions = {
  /** Defaults to true so new phone chats get resolved and persisted. */
  enrichLightspeed?: boolean;
  /** Defaults to true. Fetches and stores changed thread messages after list sync. */
  syncThreads?: boolean;
  /** Limits ongoing background prefetches; use a high value for one-off backfills. */
  threadLimit?: number;
  /** Backfill mode: sync every listed thread, even if it already has cached messages. */
  forceThreadSync?: boolean;
};

const DEFAULT_THREAD_SYNC_LIMIT = 12;

function chatTimeMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function shouldSyncNestThread(
  chat: NestConversationListItem,
  cached: NestThreadSyncState | undefined,
  force: boolean,
): boolean {
  if (isNestPortalTestChat(chat)) return false;
  if (force) return true;
  if (!cached || !cached.hasMessages) return true;
  return chatTimeMs(chat.lastMessageAt) > chatTimeMs(cached.lastMessageAt) + 999;
}

async function syncChangedNestThreadsFromPortal(
  supabase: SupabaseClient,
  userId: string,
  brandKey: string,
  chats: NestConversationListItem[],
  state: Map<string, NestThreadSyncState>,
  options: Required<Pick<NestSyncOptions, "enrichLightspeed" | "forceThreadSync">> & {
    threadLimit: number;
  },
): Promise<void> {
  const candidates = chats
    .filter((chat) => shouldSyncNestThread(chat, state.get(chat.chatId), options.forceThreadSync))
    .slice(0, options.threadLimit);

  for (const chat of candidates) {
    try {
      await syncNestThreadFromPortal(supabase, userId, brandKey, chat.chatId, {
        enrichLightspeed: options.enrichLightspeed,
        syncThreads: false,
      });
    } catch (error) {
      console.error("[unified-inbox-sync] nest thread prefetch failed:", chat.chatId, error);
    }
  }
}

export async function syncNestInboxFromPortal(
  supabase: SupabaseClient,
  userId: string,
  brandKey: string,
  options?: NestSyncOptions,
): Promise<NestConversationListItem[]> {
  const query = new URLSearchParams();
  query.set("conversations", "1");
  query.set("listOnly", "1");

  const shouldSyncThreads = options?.syncThreads ?? true;
  const shouldEnrichLightspeed = options?.enrichLightspeed ?? true;
  const threadStatePromise = shouldSyncThreads
    ? loadNestThreadSyncState(supabase, userId)
    : Promise.resolve(new Map<string, NestThreadSyncState>());

  const [data, missedCallChatIds, threadState] = await Promise.all([
    proxyNestBrandPortalRequest(brandKey, { method: "GET", query }),
    fetchNestTwilioMissedCallChatIds(brandKey),
    threadStatePromise,
  ]);

  let chats = Array.isArray(data.chats)
    ? (data.chats as NestConversationListItem[])
    : [];

  chats = enrichNestChatsWithTwilioMissedCalls(chats, missedCallChatIds);

  if (
    shouldEnrichLightspeed &&
    chats.length > 0 &&
    !isLightspeedInBackoff(userId)
  ) {
    try {
      chats = await enrichNestChatsWithLightspeed(supabase, userId, chats, {
        allowApi: true,
      });
    } catch (error) {
      console.error("[unified-inbox-sync] nest lightspeed enrich failed:", error);
    }
  }

  await upsertNestChatsToSupabase(supabase, userId, brandKey, chats);
  await touchNestSyncTimestamp(supabase, userId);

  if (shouldSyncThreads && chats.length > 0) {
    await syncChangedNestThreadsFromPortal(supabase, userId, brandKey, chats, threadState, {
      enrichLightspeed: shouldEnrichLightspeed,
      forceThreadSync: options?.forceThreadSync ?? false,
      threadLimit: options?.threadLimit ?? DEFAULT_THREAD_SYNC_LIMIT,
    });
  }

  return chats;
}

export async function syncNestThreadFromPortal(
  supabase: SupabaseClient,
  userId: string,
  brandKey: string,
  chatId: string,
  options?: NestSyncOptions,
): Promise<NestConversationDetail | null> {
  const query = new URLSearchParams();
  query.set("conversations", "1");
  query.set("chatId", chatId);
  query.set("threadOnly", "1");

  const data = await proxyNestBrandPortalRequest(brandKey, { method: "GET", query });
  if (!data.conversation || typeof data.conversation !== "object") return null;

  let conversation = data.conversation as NestConversationDetail;

  if (options?.enrichLightspeed && !isLightspeedInBackoff(userId)) {
    try {
      conversation = await enrichNestConversationWithLightspeed(
        supabase,
        userId,
        conversation,
      );
    } catch (error) {
      console.error("[unified-inbox-sync] thread lightspeed enrich failed:", error);
    }
  }

  const listChat = Array.isArray(data.chats)
    ? (data.chats as NestConversationListItem[]).find((c) => c.chatId === chatId)
    : undefined;

  await upsertNestThreadToSupabase(supabase, userId, brandKey, conversation, listChat);
  return conversation;
}

export async function backgroundReconcileGmailThreads(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  if (!isComposioConfigured()) return;
  const connections = await listGmailConnections(userId).catch(() => []);
  if (connections.length === 0) return;
  await reconcileAnsweredThreads(supabase, userId);
}

export async function loadCachedNestList(
  supabase: SupabaseClient,
  userId: string,
): Promise<NestConversationListItem[]> {
  return loadNestChatsFromSupabase(supabase, userId);
}
