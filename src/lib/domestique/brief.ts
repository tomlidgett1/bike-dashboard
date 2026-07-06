// The morning brief — the Domestique's daily surface. One Nest text to the
// owner's phone listing today's plays; approval happens in the dashboard.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DomestiqueConfig, DomestiqueOpportunity } from "@/lib/types/domestique";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { getPlaybook } from "./playbooks";

function formatAud(value: number): string {
  return `$${Math.round(value).toLocaleString("en-AU")}`;
}

export function buildBriefText(opportunities: DomestiqueOpportunity[]): string {
  const lines: string[] = [
    `Morning — your Domestique here. ${opportunities.length} ${opportunities.length === 1 ? "play" : "plays"} ready:`,
    "",
  ];
  opportunities.forEach((opp, index) => {
    const playbook = getPlaybook(opp.playbook_key);
    const scope =
      opp.customer_count > 0
        ? `${opp.customer_count} customers`
        : `${opp.product_count} products`;
    lines.push(
      `${index + 1}. ${playbook?.name ?? opp.playbook_key} — ${scope}, est. ${formatAud(Number(opp.expected_value))}`,
    );
  });
  lines.push("");
  lines.push("Review and approve in Yellow Jersey → Domestique. Plays expire tonight.");
  return lines.join("\n");
}

export async function sendMorningBrief(
  supabase: SupabaseClient,
  userId: string,
  config: DomestiqueConfig,
  opportunities: DomestiqueOpportunity[],
): Promise<boolean> {
  if (!config.brief_phone) return false;
  try {
    const { data: profile } = await supabase
      .from("users")
      .select("nest_brand_key, business_name")
      .eq("user_id", userId)
      .maybeSingle();
    const brandKey = resolveStoreNestBrandKey(profile);

    await proxyNestBrandPortalRequest(brandKey, {
      method: "POST",
      body: {
        action: "start_message",
        mobile: config.brief_phone,
        content: buildBriefText(opportunities),
        customerName: "Store owner",
      },
    });
    return true;
  } catch (error) {
    console.error("[domestique/brief] morning brief send failed:", error);
    return false;
  }
}
