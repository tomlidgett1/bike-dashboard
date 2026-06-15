import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichNestChatsWithLightspeed,
  enrichNestConversationWithLightspeed,
} from "@/lib/nest/enrich-chats-with-lightspeed";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import {
  loadNestChatsFromSupabase,
  touchNestSyncTimestamp,
  upsertNestChatsToSupabase,
  upsertNestThreadToSupabase,
} from "@/lib/nest/inbox-supabase";
import {
  enrichNestChatsWithTwilioMissedCalls,
  fetchNestTwilioMissedCallChatIds,
} from "@/lib/nest/twilio-missed-calls";
import type { NestConversationDetail, NestConversationListItem } from "@/lib/nest/types";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import { reconcileAnsweredThreads } from "@/lib/customer-inquiries/sync";
import { isComposioConfigured, listGmailConnections } from "@/lib/composio/gmail";

type NestSyncOptions = {
  /** Only set on explicit user refresh — never on background/cache reads. */
  enrichLightspeed?: boolean;
};

export async function syncNestInboxFromPortal(
  supabase: SupabaseClient,
  userId: string,
  brandKey: string,
  options?: NestSyncOptions,
): Promise<NestConversationListItem[]> {
  const query = new URLSearchParams();
  query.set("conversations", "1");
  query.set("listOnly", "1");

  const [data, missedCallChatIds] = await Promise.all([
    proxyNestBrandPortalRequest(brandKey, { method: "GET", query }),
    fetchNestTwilioMissedCallChatIds(brandKey),
  ]);

  let chats = Array.isArray(data.chats)
    ? (data.chats as NestConversationListItem[])
    : [];

  chats = enrichNestChatsWithTwilioMissedCalls(chats, missedCallChatIds);

  if (
    options?.enrichLightspeed &&
    chats.length > 0 &&
    !isLightspeedInBackoff(userId)
  ) {
    try {
      chats = await enrichNestChatsWithLightspeed(userId, chats);
    } catch (error) {
      console.error("[unified-inbox-sync] nest lightspeed enrich failed:", error);
    }
  }

  await upsertNestChatsToSupabase(supabase, userId, brandKey, chats);
  await touchNestSyncTimestamp(supabase, userId);

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
      conversation = await enrichNestConversationWithLightspeed(userId, conversation);
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
