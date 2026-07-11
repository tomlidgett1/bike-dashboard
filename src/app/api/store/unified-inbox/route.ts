import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { resolveGmailState } from "@/lib/customer-inquiries/inbox-connection-state";
import {
  mapCustomerInquiryRow,
  refreshCustomerInquiriesForUser,
} from "@/lib/customer-inquiries/sync";
import { inquiryNeedsReplyFromRow } from "@/lib/customer-inquiries/thread";
import { serializeInquiryListItem } from "@/lib/customer-inquiries/serialize";
import {
  backgroundResolveInboxPhoneContacts,
  hydrateInboxCustomerNamesFromDb,
} from "@/lib/customer-inquiries/lightspeed-phone-directory";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import { loadNestReadMapFromSupabase, getNestLastSyncedAt } from "@/lib/nest/inbox-supabase";
import {
  loadGmailInquiryReadMapFromSupabase,
  markAllGmailInquiryReadsInSupabase,
  markAllNestReadInSupabase,
  markGmailInquiryReadInSupabase,
} from "@/lib/customer-inquiries/inbox-read-supabase";
import {
  clearNestCloseInSupabase,
  loadNestCloseMapFromSupabase,
  markAllNestClosesInSupabase,
  markNestCloseInSupabase,
} from "@/lib/nest/inbox-supabase";
import { filterNestCustomerChats } from "@/lib/nest/types";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import {
  backgroundReconcileGmailThreads,
  loadCachedNestList,
  syncNestInboxFromPortal,
} from "@/lib/store/unified-inbox-sync";

export const dynamic = "force-dynamic";

const UNIFIED_INBOX_BACKGROUND_SYNC_MS = 3 * 60 * 1000;
const unifiedInboxBackgroundSyncScheduledAt = new Map<string, number>();

function isInboxSyncStale(lastSyncedAt: string | null, maxAgeMs: number): boolean {
  if (!lastSyncedAt) return true;
  const syncedMs = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(syncedMs)) return true;
  return Date.now() - syncedMs >= maxAgeMs;
}

function shouldScheduleUnifiedInboxBackgroundSync(userId: string): boolean {
  const now = Date.now();
  const lastScheduled = unifiedInboxBackgroundSyncScheduledAt.get(userId) ?? 0;
  if (now - lastScheduled < UNIFIED_INBOX_BACKGROUND_SYNC_MS) return false;
  unifiedInboxBackgroundSyncScheduledAt.set(userId, now);
  return true;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function filterInquiriesForDisplay(
  rows: ReturnType<typeof mapCustomerInquiryRow>[],
) {
  return rows.filter((row) => {
    if (row.status === "sent" || row.status === "ignored") return true;
    return inquiryNeedsReplyFromRow(row);
  });
}

async function loadInquiriesFromSupabase(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("store_customer_inquiries")
    .select("*")
    .eq("user_id", userId)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    throw new Error("Could not load customer inquiries.");
  }

  const mapped = (data ?? []).map((row) =>
    mapCustomerInquiryRow(row as Record<string, unknown>),
  );

  return filterInquiriesForDisplay(mapped).map(serializeInquiryListItem);
}

async function hydrateUnifiedInboxNames(
  supabase: SupabaseClient,
  userId: string,
  args: {
    inquiries: Awaited<ReturnType<typeof loadInquiriesFromSupabase>>;
    nestChats: Awaited<ReturnType<typeof loadCachedNestList>>;
  },
) {
  return hydrateInboxCustomerNamesFromDb(supabase, userId, args);
}

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const [inquiries, gmail, nestReadMap, gmailReadMap, nestCloseMap] = await Promise.all([
      loadInquiriesFromSupabase(auth.supabase, auth.user.id),
      resolveGmailState(auth.supabase, auth.user.id),
      loadNestReadMapFromSupabase(auth.supabase, auth.user.id),
      loadGmailInquiryReadMapFromSupabase(auth.supabase, auth.user.id),
      loadNestCloseMapFromSupabase(auth.supabase, auth.user.id),
    ]);

    const nestConfigured = isNestMessagingConfigured();
    const brandKey = resolveStoreNestBrandKey(auth.profile);

    const nestChats = nestConfigured
      ? filterNestCustomerChats(await loadCachedNestList(auth.supabase, auth.user.id))
      : [];

    const hydrated = await hydrateUnifiedInboxNames(auth.supabase, auth.user.id, {
      inquiries,
      nestChats,
    });

    const lastSyncedAt = nestConfigured
      ? await getNestLastSyncedAt(auth.supabase, auth.user.id)
      : null;
    const needsNestBootstrap = nestConfigured && Boolean(brandKey) && nestChats.length === 0;
    const shouldBackgroundSync =
      nestConfigured &&
      brandKey &&
      (needsNestBootstrap || isInboxSyncStale(lastSyncedAt, UNIFIED_INBOX_BACKGROUND_SYNC_MS)) &&
      shouldScheduleUnifiedInboxBackgroundSync(auth.user.id);

    if (shouldBackgroundSync) {
      after(async () => {
        try {
          await Promise.all([
            backgroundReconcileGmailThreads(auth.supabase, auth.user.id),
            nestConfigured && brandKey
              ? syncNestInboxFromPortal(auth.supabase, auth.user.id, brandKey, {
                  enrichLightspeed:
                    !needsNestBootstrap && !isLightspeedInBackoff(auth.user.id),
                  syncThreads: true,
                })
              : Promise.resolve(),
          ]);
          await backgroundResolveInboxPhoneContacts(auth.supabase, auth.user.id, hydrated);
        } catch (error) {
          console.error("[unified-inbox] background sync failed:", error);
        }
      });
    }

    return json({
      inquiries: hydrated.inquiries,
      nestChats: hydrated.nestChats,
      nestReadMap,
      gmailReadMap,
      nestCloseMap,
      gmail,
      nestConfigured,
      nestSyncPending: needsNestBootstrap,
      cached: true,
    });
  } catch (error) {
    console.error("[unified-inbox] GET failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not load unified inbox.",
      },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = (await request.json()) as {
      action?: string;
      chatId?: string;
      lastReadAt?: string;
      closedAt?: string;
      inquiryId?: string;
      gmailReads?: Array<{ inquiryId: string; lastReadAt: string }>;
      nestReads?: Array<{ chatId: string; lastReadAt: string }>;
      gmailIds?: string[];
      nestChatIds?: string[];
      nestCloses?: Array<{ chatId: string; closedAt: string }>;
    };
    const action = String(body.action ?? "").trim();

    if (action === "mark_gmail_read") {
      const inquiryId = String(body.inquiryId ?? "").trim();
      const lastReadAt = String(body.lastReadAt ?? "").trim();
      if (!inquiryId || !lastReadAt) {
        return json({ error: "inquiryId and lastReadAt are required." }, 400);
      }

      await markGmailInquiryReadInSupabase(auth.supabase, auth.user.id, inquiryId, lastReadAt);
      return json({ ok: true });
    }

    if (action === "mark_all_read") {
      const gmailReads = Array.isArray(body.gmailReads) ? body.gmailReads : [];
      const nestReads = Array.isArray(body.nestReads) ? body.nestReads : [];
      await Promise.all([
        markAllGmailInquiryReadsInSupabase(auth.supabase, auth.user.id, gmailReads),
        markAllNestReadInSupabase(auth.supabase, auth.user.id, nestReads),
      ]);
      return json({ ok: true });
    }

    if (action === "mark_nest_read") {
      const chatId = String(body.chatId ?? "").trim();
      const lastReadAt = String(body.lastReadAt ?? "").trim();
      if (!chatId || !lastReadAt) {
        return json({ error: "chatId and lastReadAt are required." }, 400);
      }

      const { markNestReadInSupabase } = await import("@/lib/nest/inbox-supabase");
      await markNestReadInSupabase(auth.supabase, auth.user.id, chatId, lastReadAt);
      return json({ ok: true });
    }

    if (action === "close_nest_case") {
      const chatId = String(body.chatId ?? "").trim();
      const closedAt = String(body.closedAt ?? "").trim() || new Date().toISOString();
      if (!chatId) {
        return json({ error: "chatId is required." }, 400);
      }

      await markNestCloseInSupabase(auth.supabase, auth.user.id, chatId, closedAt);
      return json({ ok: true, chatId, closedAt });
    }

    if (action === "reopen_nest_case") {
      const chatId = String(body.chatId ?? "").trim();
      if (!chatId) {
        return json({ error: "chatId is required." }, 400);
      }

      await clearNestCloseInSupabase(auth.supabase, auth.user.id, chatId);
      return json({ ok: true, chatId });
    }

    if (action === "close_cases") {
      const gmailIds = Array.isArray(body.gmailIds)
        ? body.gmailIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const nestCloses = Array.isArray(body.nestCloses)
        ? body.nestCloses
            .map((item) => ({
              chatId: String(item.chatId ?? "").trim(),
              closedAt: String(item.closedAt ?? "").trim() || new Date().toISOString(),
            }))
            .filter((item) => item.chatId)
        : [];

      const now = new Date().toISOString();

      if (gmailIds.length > 0) {
        const { error } = await auth.supabase
          .from("store_customer_inquiries")
          .update({
            status: "ignored",
            ignored_at: now,
            updated_at: now,
          })
          .eq("user_id", auth.user.id)
          .in("id", gmailIds)
          .neq("status", "sent");

        if (error) {
          console.error("[unified-inbox] bulk gmail close failed:", error.message);
          return json({ error: "Could not close Gmail enquiries." }, 500);
        }
      }

      if (nestCloses.length > 0) {
        await markAllNestClosesInSupabase(auth.supabase, auth.user.id, nestCloses);
      }

      const [inquiries, nestChats, nestReadMap, gmailReadMap, nestCloseMap] = await Promise.all([
        loadInquiriesFromSupabase(auth.supabase, auth.user.id),
        isNestMessagingConfigured()
          ? filterNestCustomerChats(await loadCachedNestList(auth.supabase, auth.user.id))
          : Promise.resolve([]),
        loadNestReadMapFromSupabase(auth.supabase, auth.user.id),
        loadGmailInquiryReadMapFromSupabase(auth.supabase, auth.user.id),
        loadNestCloseMapFromSupabase(auth.supabase, auth.user.id),
      ]);

      const hydrated = await hydrateUnifiedInboxNames(auth.supabase, auth.user.id, {
        inquiries,
        nestChats,
      });

      return json({
        inquiries: hydrated.inquiries,
        nestChats: hydrated.nestChats,
        nestReadMap,
        gmailReadMap,
        nestCloseMap,
        closedGmailIds: gmailIds,
      });
    }

    if (action === "refresh") {
      const brandKey = resolveStoreNestBrandKey(auth.profile);
      const nestConfigured = isNestMessagingConfigured();

      const gmailState = await resolveGmailState(auth.supabase, auth.user.id, {
        forceRefresh: true,
      });

      const refreshTasks: Promise<unknown>[] = [];

      if (gmailState.connected) {
        refreshTasks.push(
          refreshCustomerInquiriesForUser(
            auth.supabase,
            auth.user.id,
            auth.profile.business_name,
          ),
        );
      }

      if (nestConfigured && brandKey) {
        refreshTasks.push(
          syncNestInboxFromPortal(auth.supabase, auth.user.id, brandKey, {
            enrichLightspeed: !isLightspeedInBackoff(auth.user.id),
            syncThreads: false,
          }),
        );
      }

      const REFRESH_SYNC_TIMEOUT_MS = 25_000;
      try {
        await Promise.race([
          Promise.all(refreshTasks),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Refresh sync timed out")), REFRESH_SYNC_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        console.error("[unified-inbox] refresh sync partial/timeout:", error);
      }

      after(async () => {
        try {
          if (gmailState.connected) {
            await backgroundReconcileGmailThreads(auth.supabase, auth.user.id);
          }
          if (nestConfigured && brandKey) {
            await syncNestInboxFromPortal(auth.supabase, auth.user.id, brandKey, {
              enrichLightspeed: !isLightspeedInBackoff(auth.user.id),
              syncThreads: true,
            });
          }
          const [inquiries, nestChats] = await Promise.all([
            loadInquiriesFromSupabase(auth.supabase, auth.user.id),
            nestConfigured
              ? filterNestCustomerChats(await loadCachedNestList(auth.supabase, auth.user.id))
              : Promise.resolve([]),
          ]);
          await backgroundResolveInboxPhoneContacts(auth.supabase, auth.user.id, {
            inquiries,
            nestChats,
          });
        } catch (error) {
          console.error("[unified-inbox] refresh background sync failed:", error);
        }
      });

      const gmail = await resolveGmailState(auth.supabase, auth.user.id, { forceRefresh: true });

      const [inquiries, nestChats, nestReadMap, gmailReadMap, nestCloseMap] = await Promise.all([
        loadInquiriesFromSupabase(auth.supabase, auth.user.id),
        nestConfigured
          ? filterNestCustomerChats(await loadCachedNestList(auth.supabase, auth.user.id))
          : Promise.resolve([]),
        loadNestReadMapFromSupabase(auth.supabase, auth.user.id),
        loadGmailInquiryReadMapFromSupabase(auth.supabase, auth.user.id),
        loadNestCloseMapFromSupabase(auth.supabase, auth.user.id),
      ]);

      const hydrated = await hydrateUnifiedInboxNames(auth.supabase, auth.user.id, {
        inquiries,
        nestChats,
      });

      return json({
        inquiries: hydrated.inquiries,
        nestChats: hydrated.nestChats,
        nestReadMap,
        gmailReadMap,
        nestCloseMap,
        gmail,
        nestConfigured,
        refreshed: true,
      });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("[unified-inbox] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not update unified inbox.",
      },
      500,
    );
  }
}
