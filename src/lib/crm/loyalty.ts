import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

type SaleLine = {
  sale_id: string;
  sale_line_id: string;
  complete_time: string | null;
  customer_id: string | null;
  category: string | null;
  description: string;
  total: number | string;
};

const PAGE_SIZE = 1000;
const SERVICE_PATTERN = /\b(service|repair|labou?r|tune|workshop|fit)\b/i;

async function fetchRecentSaleLines(
  admin: AdminClient,
  userId: string,
  since: string,
): Promise<SaleLine[]> {
  const rows: SaleLine[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("lightspeed_sales_report_lines")
      .select("sale_id, sale_line_id, complete_time, customer_id, category, description, total")
      .eq("user_id", userId)
      .not("customer_id", "is", null)
      .gte("complete_time", since)
      .order("complete_time", { ascending: true })
      .order("sale_line_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load sales for loyalty: ${error.message}`);
    rows.push(...((data ?? []) as SaleLine[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function syncStoreLoyaltyFromSales(args: {
  userId: string;
  admin?: SupabaseClient;
  sinceDays?: number;
}): Promise<{ enabled: boolean; salesProcessed: number; ledgerEntries: number }> {
  const admin = (args.admin as AdminClient | undefined) ?? createServiceRoleClient();
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id")
    .eq("owner_user_id", args.userId)
    .maybeSingle();
  if (storeError) throw new Error(`Could not load store for loyalty: ${storeError.message}`);
  if (!store) return { enabled: false, salesProcessed: 0, ledgerEntries: 0 };

  const { data: programme, error: programmeError } = await admin
    .from("store_loyalty_programmes")
    .select("enabled, points_per_dollar, service_multiplier, points_expiry_days")
    .eq("store_id", store.id)
    .maybeSingle();
  if (programmeError) throw new Error(`Could not load loyalty programme: ${programmeError.message}`);
  if (!programme?.enabled) return { enabled: false, salesProcessed: 0, ledgerEntries: 0 };

  const sinceDays = Math.min(Math.max(args.sinceDays ?? 35, 1), 365);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const lines = await fetchRecentSaleLines(admin, args.userId, since);
  const lightspeedIds = [...new Set(lines.map((line) => line.customer_id).filter((id): id is string => Boolean(id)))];
  const customerByLightspeedId = new Map<string, string>();
  for (let index = 0; index < lightspeedIds.length; index += 200) {
    const { data, error } = await admin
      .from("store_customer_identities")
      .select("normalized_value, customer_id")
      .eq("store_id", store.id)
      .eq("identity_type", "lightspeed_customer_id")
      .in("normalized_value", lightspeedIds.slice(index, index + 200));
    if (error) throw new Error(`Could not resolve loyalty customers: ${error.message}`);
    for (const row of data ?? []) {
      customerByLightspeedId.set(String(row.normalized_value), String(row.customer_id));
    }
  }

  const sales = new Map<string, {
    customerId: string;
    total: number;
    serviceTotal: number;
    occurredAt: string;
  }>();
  for (const line of lines) {
    const customerId = line.customer_id ? customerByLightspeedId.get(line.customer_id) : null;
    if (!customerId) continue;
    const key = String(line.sale_id);
    const amount = Number(line.total);
    const total = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
    const existing = sales.get(key) ?? {
      customerId,
      total: 0,
      serviceTotal: 0,
      occurredAt: line.complete_time ?? new Date().toISOString(),
    };
    existing.total += total;
    if (SERVICE_PATTERN.test(`${line.category ?? ""} ${line.description ?? ""}`)) {
      existing.serviceTotal += total;
    }
    sales.set(key, existing);
  }

  const pointsPerDollar = Number(programme.points_per_dollar ?? 1);
  const serviceMultiplier = Number(programme.service_multiplier ?? 1.5);
  const expiryDays = programme.points_expiry_days == null
    ? null
    : Number(programme.points_expiry_days);
  const ledger = [...sales.entries()].map(([saleId, sale]) => {
    const productTotal = Math.max(sale.total - sale.serviceTotal, 0);
    const points = Math.max(
      Math.round(productTotal * pointsPerDollar + sale.serviceTotal * pointsPerDollar * serviceMultiplier),
      0,
    );
    return {
      store_id: String(store.id),
      customer_id: sale.customerId,
      event_type: sale.serviceTotal > 0 ? "service" : "purchase",
      points,
      source_type: "lightspeed_sale",
      source_id: saleId,
      description: sale.serviceTotal > 0 ? "Workshop and store purchase" : "Store purchase",
      expires_at: expiryDays
        ? new Date(Date.parse(sale.occurredAt) + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
      created_at: sale.occurredAt,
    };
  }).filter((entry) => entry.points > 0);

  for (let index = 0; index < ledger.length; index += 200) {
    const { error } = await admin
      .from("store_loyalty_ledger")
      .upsert(ledger.slice(index, index + 200), {
        onConflict: "store_id,source_type,source_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Could not write loyalty points: ${error.message}`);
  }

  const events = [...sales.entries()].map(([saleId, sale]) => ({
    store_id: String(store.id),
    customer_id: sale.customerId,
    event_type: "purchase",
    channel: "store",
    source_type: "lightspeed_sale",
    source_id: saleId,
    title: sale.serviceTotal > 0 ? "Workshop purchase" : "Store purchase",
    summary: sale.total.toLocaleString("en-AU", { style: "currency", currency: "AUD" }),
    occurred_at: sale.occurredAt,
    actor_type: "customer",
    direction: "inbound",
    metadata: {
      total: sale.total,
      service_total: sale.serviceTotal,
    },
  }));
  for (let index = 0; index < events.length; index += 200) {
    const { error } = await admin
      .from("store_customer_events")
      .upsert(events.slice(index, index + 200), {
        onConflict: "store_id,source_type,source_id,event_type",
      });
    if (error) throw new Error(`Could not append sale events: ${error.message}`);
  }

  return {
    enabled: true,
    salesProcessed: sales.size,
    ledgerEntries: ledger.length,
  };
}
