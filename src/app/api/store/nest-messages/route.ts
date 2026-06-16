import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import {
  getNestLastSyncedAt,
  loadNestChatsFromSupabase,
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
import { searchLightspeedCustomersForNest } from "@/lib/services/lightspeed/customer-search";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import {
  isLightspeedApiAvailable,
  isLightspeedConnected,
} from "@/lib/services/lightspeed/token-manager";
import {
  syncNestInboxFromPortal,
  syncNestThreadFromPortal,
} from "@/lib/store/unified-inbox-sync";
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

    const lightspeedConnected =
      !isLightspeedInBackoff(auth.userId) && (await isLightspeedApiAvailable(auth.userId));
    if (!lightspeedConnected) {
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
      return json(
        {
          customers: [],
          configured: true,
          lightspeedConnected: true,
          error: error instanceof Error ? error.message : "Could not search Lightspeed customers.",
        },
        502,
      );
    }
  }

  const query = new URLSearchParams();
  query.set("conversations", "1");

  const chatId = searchParams.get("chatId")?.trim();
  if (chatId) query.set("chatId", chatId);
  const listOnly = searchParams.get("listOnly") === "1";
  const threadOnly = searchParams.get("threadOnly") === "1";
  const isPoll = searchParams.get("poll") === "1";
  if (listOnly) query.set("listOnly", "1");
  if (threadOnly) query.set("threadOnly", "1");

  if (listOnly && !threadOnly) {
    let cachedChats = await loadNestChatsFromSupabase(auth.supabase, auth.userId);
    const lightspeedConnected = await isLightspeedConnected(auth.userId);
    const lastSyncedAt = await getNestLastSyncedAt(auth.supabase, auth.userId);

    if (cachedChats.length === 0) {
      try {
        cachedChats = await syncNestInboxFromPortal(auth.supabase, auth.userId, auth.brandKey, {
          enrichLightspeed: !isPoll && !isLightspeedInBackoff(auth.userId),
          syncThreads: false,
        });
      } catch (error) {
        console.error("[store-nest-messages] inline list sync failed:", error);
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
      lightspeedConnected,
    });
  }

  if (threadOnly && chatId) {
    const cachedThread = getServerNestThreadCache(auth.brandKey, chatId);
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

    const supabaseThread = await loadNestThreadFromSupabase(auth.supabase, auth.userId, chatId);
    if (supabaseThread) {
      setServerNestThreadCache(auth.brandKey, chatId, supabaseThread);

      after(() =>
        syncNestThreadFromPortal(auth.supabase, auth.userId, auth.brandKey, chatId, {
          enrichLightspeed: !isLightspeedInBackoff(auth.userId),
          syncThreads: false,
        }).catch((error) => {
          console.error("[store-nest-messages] background thread sync failed:", error);
        }),
      );

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

  try {
    const data = await proxyNestBrandPortalRequest(auth.brandKey, {
      method: "POST",
      body,
    });

    const chatId =
      typeof body.chatId === "string"
        ? body.chatId.trim()
        : typeof data.chatId === "string"
          ? data.chatId.trim()
          : "";
    if (chatId) {
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
    console.error("[store-nest-messages] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not send Nest message.",
        configured: true,
      },
      502,
    );
  }
}
