import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import {
  getNestLastSyncedAt,
  loadNestChatsFromSupabase,
  loadNestThreadLastMessageAtFromSupabase,
  loadNestThreadFromSupabase,
} from "@/lib/nest/inbox-supabase";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import {
  getServerNestThreadCache,
  invalidateServerNestThreadCache,
  setServerNestThreadCache,
} from "@/lib/nest/server-thread-cache";
import {
  enrichNestChatsWithTwilioMissedCalls,
  fetchNestTwilioMissedCallChatIds,
} from "@/lib/nest/twilio-missed-calls";
import type { NestConversationDetail, NestConversationListItem } from "@/lib/nest/types";
import { isNestStorefrontChat } from "@/lib/nest/types";
import { persistStorefrontStaffReply } from "@/lib/nest/persist-storefront-chat";
import { searchLightspeedCustomersForNest } from "@/lib/services/lightspeed/customer-search";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import {
  getConnection,
  isLightspeedConnected,
} from "@/lib/services/lightspeed/token-manager";
import {
  syncNestInboxFromPortal,
  syncNestThreadFromPortal,
} from "@/lib/store/unified-inbox-sync";
import {
  moderateNestOutboundMessage,
  NEST_CONTENT_BLOCKED_CODE,
} from "@/lib/nest/outbound-content-moderation";
import { createClient } from "@/lib/supabase/server";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Header poll sync: portal list only — no Lightspeed enrichment or thread prefetch. */
const NEST_POLL_BACKGROUND_SYNC_MS = 2 * 60 * 1000;
/** Inbox page loads: full sync, but not on every request. */
const NEST_FULL_BACKGROUND_SYNC_MS = 3 * 60 * 1000;

const nestListBackgroundSyncScheduledAt = new Map<string, number>();

function isNestSyncStale(
  lastSyncedAt: string | null,
  maxAgeMs: number,
): boolean {
  if (!lastSyncedAt) return true;
  const syncedMs = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(syncedMs)) return true;
  return Date.now() - syncedMs >= maxAgeMs;
}

function nestThreadLatestMs(conversation: NestConversationDetail): number {
  let latest = 0;
  for (const message of conversation.messages) {
    const ms = new Date(message.createdAt).getTime();
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return latest;
}

function shouldScheduleNestListBackgroundSync(
  userId: string,
  minGapMs: number,
): boolean {
  const now = Date.now();
  const lastScheduled = nestListBackgroundSyncScheduledAt.get(userId) ?? 0;
  if (now - lastScheduled < minGapMs) return false;
  nestListBackgroundSyncScheduledAt.set(userId, now);
  return true;
}

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: json({ error: "Unauthorised" }, 401) } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("account_type, bicycle_store, nest_brand_key, business_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: json({ error: "Could not load store profile." }, 500) } as const;
  }

  if (profile?.account_type !== "bicycle_store" || profile?.bicycle_store !== true) {
    return { error: json({ error: "Store access required." }, 403) } as const;
  }

  if (!isNestMessagingConfigured()) {
    return {
      error: json(
        {
          error: "Nest messaging is not configured yet.",
          configured: false,
        },
        503,
      ),
    } as const;
  }

  return {
    supabase,
    userId: user.id,
    brandKey: resolveStoreNestBrandKey(profile),
  } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);

  if (searchParams.get("customerSearch") === "1") {
    const q = searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return json({ customers: [], configured: true, lightspeedConnected: true });
    }

    const connection = await getConnection(auth.userId);
    if (
      !connection ||
      connection.status === "disconnected" ||
      connection.status === "expired"
    ) {
      return json({
        customers: [],
        configured: true,
        lightspeedConnected: false,
        error: "Connect Lightspeed to search customers.",
      });
    }

    try {
      const customers = await searchLightspeedCustomersForNest(auth.userId, q);
      return json({
        customers,
        configured: true,
        lightspeedConnected: true,
      });
    } catch (error) {
      console.error("[store-nest-messages] customer search failed:", error);
      const message =
        error instanceof Error ? error.message : "Could not search Lightspeed customers.";
      const needsReconnect = /reconnect|session expired|no valid access token/i.test(
        message,
      );
      return json(
        {
          customers: [],
          configured: true,
          lightspeedConnected: !needsReconnect,
          error: needsReconnect
            ? "Connect Lightspeed to search customers."
            : message,
        },
        needsReconnect ? 200 : 502,
      );
    }
  }

  const query = new URLSearchParams();
  query.set("conversations", "1");

  const chatId = searchParams.get("chatId")?.trim();
  const since = searchParams.get("since")?.trim() || null;
  if (chatId) query.set("chatId", chatId);
  const listOnly = searchParams.get("listOnly") === "1";
  const threadOnly = searchParams.get("threadOnly") === "1";
  const isPoll = searchParams.get("poll") === "1";
  if (listOnly) query.set("listOnly", "1");
  if (threadOnly) query.set("threadOnly", "1");

  if (listOnly && !threadOnly) {
    const [cachedChats, lightspeedConnected, lastSyncedAt] = await Promise.all([
      loadNestChatsFromSupabase(auth.supabase, auth.userId),
      isLightspeedConnected(auth.userId),
      getNestLastSyncedAt(auth.supabase, auth.userId),
    ]);

    if (cachedChats.length === 0) {
      const minGapMs = isPoll
        ? NEST_POLL_BACKGROUND_SYNC_MS
        : NEST_FULL_BACKGROUND_SYNC_MS;
      if (shouldScheduleNestListBackgroundSync(auth.userId, minGapMs)) {
        after(() =>
          syncNestInboxFromPortal(auth.supabase, auth.userId, auth.brandKey, {
            enrichLightspeed: false,
            syncThreads: false,
          }).catch((error) => {
            console.error("[store-nest-messages] cold list background sync failed:", error);
          }),
        );
      }
    } else if (isPoll) {
      const stale = isNestSyncStale(lastSyncedAt, NEST_POLL_BACKGROUND_SYNC_MS);
      if (
        stale &&
        shouldScheduleNestListBackgroundSync(
          auth.userId,
          NEST_POLL_BACKGROUND_SYNC_MS,
        )
      ) {
        after(() =>
          syncNestInboxFromPortal(auth.supabase, auth.userId, auth.brandKey, {
            enrichLightspeed: false,
            syncThreads: false,
          }).catch((error) => {
            console.error("[store-nest-messages] poll background sync failed:", error);
          }),
        );
      }
    } else {
      const stale = isNestSyncStale(lastSyncedAt, NEST_FULL_BACKGROUND_SYNC_MS);
      if (
        stale &&
        shouldScheduleNestListBackgroundSync(
          auth.userId,
          NEST_FULL_BACKGROUND_SYNC_MS,
        )
      ) {
        after(() =>
          syncNestInboxFromPortal(auth.supabase, auth.userId, auth.brandKey, {
            enrichLightspeed: !isLightspeedInBackoff(auth.userId),
            syncThreads: true,
          }).catch((error) => {
            console.error("[store-nest-messages] background list sync failed:", error);
          }),
        );
      }
    }

    return json({
      chats: cachedChats,
      selectedChatId: null,
      conversation: null,
      configured: true,
      brandKey: auth.brandKey,
      cached: cachedChats.length > 0,
      syncPending: cachedChats.length === 0,
      lightspeedConnected,
    });
  }

  if (threadOnly && chatId) {
    const cachedThread = getServerNestThreadCache(auth.brandKey, chatId);

    if (since) {
      const sinceMs = new Date(since).getTime();
      if (Number.isFinite(sinceMs)) {
        if (cachedThread && nestThreadLatestMs(cachedThread) > sinceMs) {
          return json({
            chats: [],
            selectedChatId: chatId,
            conversation: cachedThread,
            configured: true,
            brandKey: auth.brandKey,
            cached: true,
          });
        }

        const latestStoredAt = await loadNestThreadLastMessageAtFromSupabase(
          auth.supabase,
          auth.userId,
          chatId,
        );
        const latestStoredMs = latestStoredAt ? new Date(latestStoredAt).getTime() : 0;
        if (latestStoredMs > 0 && latestStoredMs <= sinceMs) {
          return json({
            chats: [],
            selectedChatId: chatId,
            conversation: null,
            configured: true,
            brandKey: auth.brandKey,
            cached: true,
            unchanged: true,
          });
        }
      }
    }

    const supabaseThread = await loadNestThreadFromSupabase(auth.supabase, auth.userId, chatId);

    // Prefer Supabase when it has a newer or richer thread than the short-lived
    // memory cache — image-only human-mode messages often land in Supabase via
    // Linq backfill a few seconds after the cache was primed.
    const preferSupabase =
      !!supabaseThread &&
      (!cachedThread ||
        supabaseThread.messages.length > cachedThread.messages.length ||
        nestThreadLatestMs(supabaseThread) > nestThreadLatestMs(cachedThread) + 999);

    if (preferSupabase && supabaseThread) {
      setServerNestThreadCache(auth.brandKey, chatId, supabaseThread);

      if (!isNestStorefrontChat(chatId)) {
        after(() =>
          syncNestThreadFromPortal(auth.supabase, auth.userId, auth.brandKey, chatId, {
            enrichLightspeed: !isLightspeedInBackoff(auth.userId),
            syncThreads: false,
          }).catch((error) => {
            console.error("[store-nest-messages] background thread sync failed:", error);
          }),
        );
      }

      return json({
        chats: [],
        selectedChatId: chatId,
        conversation: supabaseThread,
        configured: true,
        brandKey: auth.brandKey,
        cached: true,
        lightspeedConnected: await isLightspeedConnected(auth.userId),
      });
    }

    if (cachedThread) {
      return json({
        chats: [],
        selectedChatId: chatId,
        conversation: cachedThread,
        configured: true,
        brandKey: auth.brandKey,
        cached: true,
        lightspeedConnected: await isLightspeedConnected(auth.userId),
      });
    }

    // Storefront chatbot threads never exist on the Nest portal.
    if (isNestStorefrontChat(chatId)) {
      return json({
        chats: [],
        selectedChatId: chatId,
        conversation: null,
        configured: true,
        brandKey: auth.brandKey,
        cached: false,
        lightspeedConnected: await isLightspeedConnected(auth.userId),
      });
    }

    // Fall through to live portal fetch when neither cache nor Supabase has the thread.

    try {
      const conversation = await syncNestThreadFromPortal(
        auth.supabase,
        auth.userId,
        auth.brandKey,
        chatId,
        { enrichLightspeed: !isLightspeedInBackoff(auth.userId), syncThreads: false },
      );
      if (conversation) {
        setServerNestThreadCache(auth.brandKey, chatId, conversation);
      }

      return json({
        chats: [],
        selectedChatId: chatId,
        conversation,
        configured: true,
        brandKey: auth.brandKey,
        cached: false,
        lightspeedConnected: await isLightspeedConnected(auth.userId),
      });
    } catch (error) {
      console.error("[store-nest-messages] thread sync failed:", error);
      return json(
        {
          error: error instanceof Error ? error.message : "Could not load conversation.",
          configured: true,
        },
        502,
      );
    }
  }

  if (threadOnly) {
    return json(
      {
        error: "chatId is required for thread loads.",
        configured: true,
      },
      400,
    );
  }

  try {
    const [data, missedCallChatIds] = await Promise.all([
      proxyNestBrandPortalRequest(auth.brandKey, {
        method: "GET",
        query,
      }),
      threadOnly ? Promise.resolve(new Set<string>()) : fetchNestTwilioMissedCallChatIds(auth.brandKey),
    ]);

    const lightspeedConnected = await isLightspeedConnected(auth.userId);

    if (Array.isArray(data.chats) && !threadOnly) {
      data.chats = enrichNestChatsWithTwilioMissedCalls(
        data.chats as NestConversationListItem[],
        missedCallChatIds,
      );
    }

    if (threadOnly && chatId && data.conversation && typeof data.conversation === "object") {
      setServerNestThreadCache(
        auth.brandKey,
        chatId,
        data.conversation as NestConversationDetail,
      );
      const { upsertNestThreadToSupabase } = await import("@/lib/nest/inbox-supabase");
      const listChat = Array.isArray(data.chats)
        ? (data.chats as NestConversationListItem[]).find((c) => c.chatId === chatId)
        : undefined;
      await upsertNestThreadToSupabase(
        auth.supabase,
        auth.userId,
        auth.brandKey,
        data.conversation as NestConversationDetail,
        listChat,
      );
    }

    if (!threadOnly && Array.isArray(data.chats)) {
      const { upsertNestChatsToSupabase, touchNestSyncTimestamp } = await import(
        "@/lib/nest/inbox-supabase"
      );
      await upsertNestChatsToSupabase(
        auth.supabase,
        auth.userId,
        auth.brandKey,
        data.chats as NestConversationListItem[],
      );
      await touchNestSyncTimestamp(auth.supabase, auth.userId);
    }

    return json({ ...data, configured: true, brandKey: auth.brandKey, lightspeedConnected });
  } catch (error) {
    console.error("[store-nest-messages] GET failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not load Nest messages.",
        configured: true,
      },
      502,
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "send_message" && action !== "start_message") {
    return json({ error: "Unsupported action." }, 400);
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (content.trim()) {
    // Defence in depth: gate here so staff UI is blocked even if the portal runs externally.
    const moderation = await moderateNestOutboundMessage(content);
    if (!moderation.allowed) {
      return json(
        {
          error: moderation.userMessage,
          code: moderation.code,
          categories: moderation.categories,
          configured: true,
          brandKey: auth.brandKey,
        },
        422,
      );
    }
  }

  try {
    const requestChatId = typeof body.chatId === "string" ? body.chatId.trim() : "";

    // Website chatbot threads live only in Supabase — do not proxy to Linq/portal.
    if (requestChatId && isNestStorefrontChat(requestChatId) && action === "send_message") {
      const trimmed = content.trim();
      if (!trimmed) {
        return json({ error: "Message content is required." }, 400);
      }

      const { createServiceRoleClient } = await import("@/lib/supabase/server");
      const service = createServiceRoleClient();
      const { messageId, createdAt } = await persistStorefrontStaffReply({
        supabase: service,
        storeUserId: auth.userId,
        brandKey: auth.brandKey,
        chatId: requestChatId,
        content: trimmed,
      });
      invalidateServerNestThreadCache(auth.brandKey, requestChatId);

      return json({
        ok: true,
        chatId: requestChatId,
        message: {
          id: messageId,
          role: "assistant",
          content: trimmed,
          handle: `staff@${auth.brandKey}`,
          createdAt,
          metadata: {
            source: "brand_portal_staff_reply",
            service: "storefront_chat",
          },
        },
        configured: true,
        brandKey: auth.brandKey,
      });
    }

    const data = await proxyNestBrandPortalRequest(auth.brandKey, {
      method: "POST",
      body,
    });

    const chatId =
      requestChatId ||
      (typeof data.chatId === "string" ? data.chatId.trim() : "");
    if (chatId && !isNestStorefrontChat(chatId)) {
      invalidateServerNestThreadCache(auth.brandKey, chatId);
      after(() =>
        syncNestThreadFromPortal(auth.supabase, auth.userId, auth.brandKey, chatId, {
          enrichLightspeed: true,
          syncThreads: false,
        }).catch((error) => {
          console.error("[store-nest-messages] post-send thread sync failed:", error);
        }),
      );
    }

    return json({ ...data, configured: true, brandKey: auth.brandKey });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not send Nest message.";
    const isContentBlocked =
      message.includes(NEST_CONTENT_BLOCKED_CODE) ||
      /inappropriate for a customer|can't be sent/i.test(message);
    console.error("[store-nest-messages] POST failed:", error);
    return json(
      {
        error: message,
        ...(isContentBlocked ? { code: NEST_CONTENT_BLOCKED_CODE } : {}),
        configured: true,
      },
      isContentBlocked ? 422 : 502,
    );
  }
}
