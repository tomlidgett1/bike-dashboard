// Load store context for CRM agent — branding, style profile, past campaign performance.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEmailStyleProfile } from "@/lib/customer-inquiries/style-profile";
import type { StoreAgentContext } from "./types";

export async function loadStoreAgentContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoreAgentContext> {
  const [{ data: storeRow }, { count: total }, { count: optedOut }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("users")
        .select("business_name, name, logo_url")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("crm_contacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("crm_contacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("opted_out", true),
      supabase
        .from("crm_campaigns")
        .select("subject, sent_count, delivered_count, opened_count, clicked_count, sent_at")
        .eq("user_id", userId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(8),
    ]);

  const storeName = storeRow?.business_name || storeRow?.name || "Your Bike Store";
  const styleProfile = await loadEmailStyleProfile(supabase, userId, storeName);
  const totalCount = total ?? 0;
  const optedOutCount = optedOut ?? 0;

  const pastCampaigns = (campaigns ?? []).map((row) => {
    const sent = Number(row.sent_count ?? 0);
    const delivered = Number(row.delivered_count ?? 0);
    const opened = Number(row.opened_count ?? 0);
    const clicked = Number(row.clicked_count ?? 0);
    // Rates over delivered (industry standard), falling back to sent while
    // delivery webhooks are still arriving.
    const base = delivered > 0 ? delivered : sent;
    return {
      subject: String(row.subject ?? ""),
      openRate: base > 0 ? Math.round((opened / base) * 100) : 0,
      clickRate: base > 0 ? Math.round((clicked / base) * 100) : 0,
      sentAt: row.sent_at ? String(row.sent_at) : null,
    };
  });

  return {
    storeName,
    logoUrl: storeRow?.logo_url ?? null,
    styleProfile: styleProfile
      ? {
          tone: styleProfile.tone,
          greeting_style: styleProfile.greeting_style,
          signoff_style: styleProfile.signoff_style,
          common_phrases: styleProfile.common_phrases,
        }
      : null,
    pastCampaigns,
    contactStats: {
      total: totalCount,
      eligible: totalCount - optedOutCount,
      optedOut: optedOutCount,
    },
  };
}
