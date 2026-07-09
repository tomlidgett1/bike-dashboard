import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGmailInquiryReadMapFromSupabase } from "@/lib/customer-inquiries/inbox-read-supabase";
import { mapCustomerInquiryRow } from "@/lib/customer-inquiries/sync";
import { inquiryNeedsReplyFromRow } from "@/lib/customer-inquiries/thread";
import { serializeInquiryListItem } from "@/lib/customer-inquiries/serialize";
import { countUnifiedInboxUnread } from "@/lib/customer-inquiries/unified-inbox-unread";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { loadNestCloseMapFromSupabase, loadNestReadMapFromSupabase } from "@/lib/nest/inbox-supabase";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import { filterNestCustomerChats } from "@/lib/nest/types";
import {
  loadCachedNestList,
  syncNestInboxFromPortal,
} from "@/lib/store/unified-inbox-sync";
import type { StoreAuth } from "@/lib/customer-inquiries/auth";

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

/** Count unified-inbox rows shown as unread in the Customer enquiries inbox. */
export async function countStoreInboxUnread(auth: StoreAuth): Promise<number> {
  const userId = auth.user.id;
  const [inquiries, nestReadMap, gmailReadMap, nestCloseMap] = await Promise.all([
    loadInquiriesFromSupabase(auth.supabase, userId),
    loadNestReadMapFromSupabase(auth.supabase, userId),
    loadGmailInquiryReadMapFromSupabase(auth.supabase, userId),
    loadNestCloseMapFromSupabase(auth.supabase, userId),
  ]);

  const nestConfigured = isNestMessagingConfigured();
  const brandKey = resolveStoreNestBrandKey(auth.profile);

  let nestChats = nestConfigured
    ? filterNestCustomerChats(await loadCachedNestList(auth.supabase, userId))
    : [];

  if (nestConfigured && brandKey && nestChats.length === 0) {
    try {
      nestChats = filterNestCustomerChats(
        await syncNestInboxFromPortal(auth.supabase, userId, brandKey, {
          enrichLightspeed: true,
          syncThreads: false,
        }),
      );
    } catch (error) {
      console.error("[unread-count] inline nest sync failed:", error);
    }
  }

  return countUnifiedInboxUnread({
    inquiries,
    nestChats,
    gmailReadMap,
    nestReadMap,
    nestCloseMap,
    nestConfigured,
  });
}
