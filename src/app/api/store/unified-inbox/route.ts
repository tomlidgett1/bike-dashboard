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
import { loadNestReadMapFromSupabase } from "@/lib/nest/inbox-supabase";
import { filterNestCustomerChats } from "@/lib/nest/types";
import {
  backgroundReconcileGmailThreads,
  loadCachedNestList,
  syncNestInboxFromPortal,
} from "@/lib/store/unified-inbox-sync";

export const dynamic = "force-dynamic";

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

    const [inquiries, gmail, nestReadMap] = await Promise.all([
      loadInquiriesFromSupabase(auth.supabase, auth.user.id),
      resolveGmailState(auth.supabase, auth.user.id),
      loadNestReadMapFromSupabase(auth.supabase, auth.user.id),
    ]);

    const nestConfigured = isNestMessagingConfigured();
    const brandKey = resolveStoreNestBrandKey(auth.profile);

    let nestChats = nestConfigured
      ? filterNestCustomerChats(await loadCachedNestList(auth.supabase, auth.user.id))
      : [];

    const shouldSyncNestInline = nestConfigured && brandKey && nestChats.length === 0;

    if (shouldSyncNestInline) {
      try {
        nestChats = filterNestCustomerChats(
          await syncNestInboxFromPortal(auth.supabase, auth.user.id, brandKey, {
            enrichLightspeed: true,
            syncThreads: false,
          }),
        );
      } catch (error) {
        console.error("[unified-inbox] inline nest sync failed:", error);
      }
    }

    const hydrated = await hydrateUnifiedInboxNames(auth.supabase, auth.user.id, {
      inquiries,
      nestChats,
    });

    after(async () => {
      try {
        await backgroundReconcileGmailThreads(auth.supabase, auth.user.id);
        if (nestConfigured && brandKey) {
          await syncNestInboxFromPortal(auth.supabase, auth.user.id, brandKey, {
            enrichLightspeed: true,
            syncThreads: true,
          });
        }
        await backgroundResolveInboxPhoneContacts(auth.supabase, auth.user.id, hydrated);
      } catch (error) {
        console.error("[unified-inbox] background sync failed:", error);
      }
    });

    return json({
      inquiries: hydrated.inquiries,
      nestChats: hydrated.nestChats,
      nestReadMap,
      gmail,
      nestConfigured,
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

    const body = (await request.json()) as { action?: string; chatId?: string; lastReadAt?: string };
    const action = String(body.action ?? "").trim();

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

    if (action === "refresh") {
      const brandKey = resolveStoreNestBrandKey(auth.profile);
      const nestConfigured = isNestMessagingConfigured();

      const refreshTasks: Promise<unknown>[] = [];
      const gmailState = await resolveGmailState(auth.supabase, auth.user.id, {
        forceRefresh: true,
      });

      if (gmailState.connected) {
        refreshTasks.push(
          refreshCustomerInquiriesForUser(
            auth.supabase,
            auth.user.id,
            auth.profile.business_name,
          ),
        );
        refreshTasks.push(backgroundReconcileGmailThreads(auth.supabase, auth.user.id));
      }

      if (nestConfigured && brandKey) {
        refreshTasks.push(
          syncNestInboxFromPortal(auth.supabase, auth.user.id, brandKey, {
            enrichLightspeed: true,
          }),
        );
      }

      await Promise.all(refreshTasks);

      const gmail = await resolveGmailState(auth.supabase, auth.user.id, { forceRefresh: true });

      const [inquiries, nestChats, nestReadMap] = await Promise.all([
        loadInquiriesFromSupabase(auth.supabase, auth.user.id),
        nestConfigured
          ? filterNestCustomerChats(await loadCachedNestList(auth.supabase, auth.user.id))
          : Promise.resolve([]),
        loadNestReadMapFromSupabase(auth.supabase, auth.user.id),
      ]);

      const hydrated = await hydrateUnifiedInboxNames(auth.supabase, auth.user.id, {
        inquiries,
        nestChats,
      });

      return json({
        inquiries: hydrated.inquiries,
        nestChats: hydrated.nestChats,
        nestReadMap,
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
