// Enrich CRM contacts with Lightspeed join date + purchase stats from sales report lines.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LightspeedClient } from "@/lib/services/lightspeed/lightspeed-client";
import type { LightspeedCustomer } from "@/lib/services/lightspeed/types";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "./postgrest-page";

export type CrmEnrichResult = {
  joinedUpdated: number;
  statsUpdated: number;
  skipped: number;
  contactsWithLightspeedId?: number;
  distinctCustomersInSales?: number;
  salesReportLines?: number;
};

export function joinedAtFromCustomer(customer: LightspeedCustomer): string | null {
  return parseTime(customer.createTime);
}

function parseTime(value: string | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Aggregate spend / visits from every synced sales report line (SQL, no row cap). */
export async function enrichContactsFromSalesReport(
  supabase: SupabaseClient,
  userId: string,
): Promise<CrmEnrichResult> {
  const { data, error } = await supabase.rpc("crm_refresh_contact_stats", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to refresh contact stats: ${error.message}`);
  }

  const payload = (data ?? {}) as Record<string, number>;
  return {
    joinedUpdated: 0,
    statsUpdated: Number(payload.statsUpdated ?? 0),
    skipped: Number(payload.skipped ?? 0),
    contactsWithLightspeedId: Number(payload.contactsWithLightspeedId ?? 0),
    distinctCustomersInSales: Number(payload.distinctCustomersInSales ?? 0),
    salesReportLines: Number(payload.salesReportLines ?? 0),
  };
}

/** Backfill lightspeed_joined_at from Lightspeed customer createTime. */
export async function enrichJoinedDatesFromLightspeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const client = new LightspeedClient(userId);
  const { customers } = await client.getAllCustomersCursor(
    { archived: "false" },
    { limit: 100, maxPages: 300 },
  );

  const byCustomerId = new Map<string, string>();
  for (const customer of customers) {
    const id = customer.customerID ? String(customer.customerID) : "";
    const joinedAt = joinedAtFromCustomer(customer);
    if (id && joinedAt) byCustomerId.set(id, joinedAt);
  }

  let contacts;
  try {
    contacts = await fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_contacts")
          .select("id, lightspeed_customer_id, lightspeed_joined_at")
          .eq("user_id", userId)
          .not("lightspeed_customer_id", "is", null)
          .is("lightspeed_joined_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    });
  } catch (error) {
    throw new Error(
      `Failed to load contacts for join dates: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const contact of contacts) {
    const customerId = String(contact.lightspeed_customer_id ?? "").trim();
    const joinedAt = byCustomerId.get(customerId);
    if (!joinedAt) continue;

    const { error: updateError } = await supabase
      .from("crm_contacts")
      .update({ lightspeed_joined_at: joinedAt, updated_at: now })
      .eq("id", contact.id)
      .eq("user_id", userId);
    if (!updateError) updated++;
  }

  return updated;
}

export async function enrichCrmContacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<CrmEnrichResult> {
  const stats = await enrichContactsFromSalesReport(supabase, userId);
  const joinedUpdated = await enrichJoinedDatesFromLightspeed(supabase, userId).catch((error) => {
    console.warn("[crm] join date enrichment failed:", error);
    return 0;
  });
  return { ...stats, joinedUpdated };
}

export async function patchContactJoinedDates(
  supabase: SupabaseClient,
  userId: string,
  rows: Array<{ email: string; joinedAt: string | null }>,
): Promise<number> {
  let updated = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await Promise.all(
      chunk.map(async (row) => {
        if (!row.joinedAt) return;
        const { error } = await supabase
          .from("crm_contacts")
          .update({ lightspeed_joined_at: row.joinedAt, updated_at: now })
          .eq("user_id", userId)
          .eq("email", row.email);
        if (!error) updated++;
      }),
    );
  }
  return updated;
}
