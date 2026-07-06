// The Domestique detector battery.
//
// Deterministic SQL/JS detection over the Lightspeed mirrors — cheap,
// auditable, reliable. The LLM layer (compose.ts) only writes copy; it never
// does the arithmetic. Each detector returns a fully-evidenced opportunity
// draft (targets + metrics) which the orchestrator scores and proposes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DomestiqueConfig,
  DomestiqueDiscountItem,
  DomestiqueEvidence,
  DomestiquePlaybookKey,
  DomestiqueTargetContact,
} from "@/lib/types/domestique";
import {
  SPECIALS_PRODUCT_COLUMNS,
  buildProductMetrics,
  fetchSalesAggregates,
  type RawSpecialsProductRow,
} from "@/lib/store/specials/metrics";
import { clearanceScore, proposeDiscount, marginAtDiscount } from "@/lib/store/specials/discount-engine";

const DAY_MS = 24 * 60 * 60 * 1000;
const SALES_LOOKBACK_DAYS = 400;
const SALES_FETCH_LIMIT = 50_000;
const MAX_TARGETS_PER_PLAY = 60;

/** A detector's raw finding before scoring/copywriting. */
export interface DetectedOpportunity {
  playbook_key: DomestiquePlaybookKey;
  title: string;
  summary: string;
  evidence: DomestiqueEvidence;
  contacts: DomestiqueTargetContact[];
  discounts?: DomestiqueDiscountItem[];
  expected_value: number;
  confidence: number;
}

interface ContactRow {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  lightspeed_customer_id: string | null;
  total_spend: number | string | null;
  last_purchase_at: string | null;
  opted_out: boolean;
}

interface SaleLine {
  customer_id: string | null;
  complete_time: string | null;
  description: string | null;
  category: string | null;
  total: number;
}

export interface DetectorContext {
  supabase: SupabaseClient;
  userId: string;
  config: DomestiqueConfig;
  now: Date;
  contactsByCustomerId: Map<string, ContactRow>;
  salesLines: SaleLine[];
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

function daysAgo(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

const BIKE_RE = /\b(bike|bicycle|e-?bike|mtb|gravel|road bike|hardtail|dual susp)\b/i;
const SERVICE_RE = /\b(service|servicing|labour|labor|workshop|repair|tune|overhaul|build fee)\b/i;

const CONSUMABLE_GROUPS: Array<{ label: string; re: RegExp; dueFromDays: number; dueToDays: number }> = [
  { label: "chain", re: /\bchain(?!ring guard)\b/i, dueFromDays: 150, dueToDays: 300 },
  { label: "tyres", re: /\b(tyre|tire)\b/i, dueFromDays: 180, dueToDays: 330 },
  { label: "brake pads", re: /\b(brake pad|disc pad)\b/i, dueFromDays: 120, dueToDays: 270 },
];

function lineMatches(line: SaleLine, re: RegExp): boolean {
  return re.test(line.description ?? "") || re.test(line.category ?? "");
}

/** Load everything the customer detectors need in two bounded queries. */
export async function buildDetectorContext(
  supabase: SupabaseClient,
  userId: string,
  config: DomestiqueConfig,
  now: Date = new Date(),
): Promise<DetectorContext> {
  const since = new Date(now.getTime() - SALES_LOOKBACK_DAYS * DAY_MS).toISOString();

  const [contactsRes, linesRes] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id, email, phone, first_name, lightspeed_customer_id, total_spend, last_purchase_at, opted_out")
      .eq("user_id", userId)
      .eq("opted_out", false)
      .limit(20_000),
    supabase
      .from("lightspeed_sales_report_lines")
      .select("customer_id, complete_time, description, category, total")
      .eq("user_id", userId)
      .not("customer_id", "is", null)
      .gte("complete_time", since)
      .order("complete_time", { ascending: false })
      .limit(SALES_FETCH_LIMIT),
  ]);

  const contactsByCustomerId = new Map<string, ContactRow>();
  for (const row of (contactsRes.data ?? []) as ContactRow[]) {
    if (row.lightspeed_customer_id) contactsByCustomerId.set(row.lightspeed_customer_id, row);
  }

  const salesLines: SaleLine[] = ((linesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    customer_id: (row.customer_id as string | null) ?? null,
    complete_time: (row.complete_time as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    total: num(row.total as number | string | null),
  }));

  return { supabase, userId, config, now, contactsByCustomerId, salesLines };
}

function toTarget(contact: ContactRow, context: string): DomestiqueTargetContact {
  return {
    contact_id: contact.id,
    first_name: contact.first_name,
    email: contact.email,
    phone: contact.phone,
    lightspeed_customer_id: contact.lightspeed_customer_id,
    context,
  };
}

/** Customers who bought a bike in [fromDays, toDays] ago with no service since. */
function findUnservicedBikeBuyers(
  ctx: DetectorContext,
  fromDays: number,
  toDays: number,
  minSpend: number,
): Array<{ contact: ContactRow; bikeDescription: string; daysSince: number }> {
  const lastServiceByCustomer = new Map<string, number>(); // days ago of most recent service
  const bikeBuyByCustomer = new Map<string, { description: string; daysSince: number }>();

  for (const line of ctx.salesLines) {
    if (!line.customer_id || !line.complete_time) continue;
    const days = daysAgo(line.complete_time, ctx.now);
    if (days == null) continue;

    if (lineMatches(line, SERVICE_RE)) {
      const prev = lastServiceByCustomer.get(line.customer_id);
      if (prev == null || days < prev) lastServiceByCustomer.set(line.customer_id, days);
      continue;
    }

    if (line.total >= minSpend && lineMatches(line, BIKE_RE) && days >= fromDays && days <= toDays) {
      const prev = bikeBuyByCustomer.get(line.customer_id);
      if (!prev || days < prev.daysSince) {
        bikeBuyByCustomer.set(line.customer_id, {
          description: (line.description ?? "a bike").trim(),
          daysSince: days,
        });
      }
    }
  }

  const out: Array<{ contact: ContactRow; bikeDescription: string; daysSince: number }> = [];
  for (const [customerId, buy] of bikeBuyByCustomer) {
    const lastService = lastServiceByCustomer.get(customerId);
    // Serviced since the bike purchase → not a target.
    if (lastService != null && lastService < buy.daysSince) continue;
    const contact = ctx.contactsByCustomerId.get(customerId);
    if (!contact || (!contact.email && !contact.phone)) continue;
    out.push({ contact, bikeDescription: buy.description, daysSince: buy.daysSince });
  }
  return out;
}

// ------------------------------------------------------------------
// Detectors
// ------------------------------------------------------------------

export function detectServiceChase(ctx: DetectorContext): DetectedOpportunity | null {
  const targets = findUnservicedBikeBuyers(ctx, 300, 380, 500);
  if (targets.length < 2) return null;

  const contacts = targets
    .slice(0, MAX_TARGETS_PER_PLAY)
    .map((t) => toTarget(t.contact, `${t.bikeDescription} — bought ${Math.round(t.daysSince / 30)} months ago, no service since`));

  const avgServiceValue = 150;
  const expected = contacts.length * avgServiceValue * 0.12;

  return {
    playbook_key: "service_chase",
    title: `Service Chase — ${contacts.length} riders due their annual service`,
    summary: `${contacts.length} customers bought a bike 10–12 months ago and haven't booked a service since. Annual services are the highest-margin revenue in the shop.`,
    evidence: {
      points: [
        `${contacts.length} bike purchases between 300 and 380 days old with no service line on their account since`,
        `Assumes ~$${avgServiceValue} average service value at a 12% booking rate`,
      ],
      metrics: { customers: contacts.length, avg_service_value: avgServiceValue },
    },
    contacts,
    expected_value: Math.round(expected),
    confidence: 0.75,
  };
}

export function detectFirstServiceRescue(ctx: DetectorContext): DetectedOpportunity | null {
  const targets = findUnservicedBikeBuyers(ctx, 35, 56, 400);
  if (targets.length < 1) return null;

  const contacts = targets
    .filter((t) => t.contact.phone) // texts only — this play is a friendly nudge, not a campaign
    .slice(0, MAX_TARGETS_PER_PLAY)
    .map((t) => toTarget(t.contact, `${t.bikeDescription} — ${t.daysSince} days old, free first service unredeemed`));
  if (contacts.length < 1) return null;

  const expected = contacts.length * 120 * 0.35;

  return {
    playbook_key: "first_service_rescue",
    title: `First-Service Rescue — ${contacts.length} new bikes due their free check`,
    summary: `${contacts.length} bikes sold 5–8 weeks ago haven't been back for their free first service. A friendly text locks in the service relationship for the life of the bike.`,
    evidence: {
      points: [
        `${contacts.length} bike purchases 35–56 days old with no workshop visit since`,
        `First services convert at ~35% from a personal text and seed future paid services`,
      ],
      metrics: { customers: contacts.length },
    },
    contacts,
    expected_value: Math.round(expected),
    confidence: 0.8,
  };
}

export async function detectVipWinback(ctx: DetectorContext): Promise<DetectedOpportunity | null> {
  const sixMonthsAgo = new Date(ctx.now.getTime() - 183 * DAY_MS).toISOString();
  const { data, error } = await ctx.supabase
    .from("crm_contacts")
    .select("id, email, phone, first_name, lightspeed_customer_id, total_spend, last_purchase_at, opted_out")
    .eq("user_id", ctx.userId)
    .eq("opted_out", false)
    .gte("total_spend", 1500)
    .not("last_purchase_at", "is", null)
    .lt("last_purchase_at", sixMonthsAgo)
    .order("total_spend", { ascending: false })
    .limit(MAX_TARGETS_PER_PLAY);
  if (error) {
    console.error("[domestique/detectors] vip_winback query failed:", error.message);
    return null;
  }

  const rows = (data ?? []) as ContactRow[];
  const withEmail = rows.filter((row) => row.email);
  if (withEmail.length < 2) return null;

  const totalSpend = withEmail.reduce((sum, row) => sum + num(row.total_spend), 0);
  const contacts = withEmail.map((row) => {
    const months = row.last_purchase_at ? Math.round((daysAgo(row.last_purchase_at, ctx.now) ?? 0) / 30) : null;
    return toTarget(row, `$${Math.round(num(row.total_spend)).toLocaleString("en-AU")} lifetime, quiet ${months ?? "6+"} months`);
  });

  const expected = contacts.length * 200 * 0.08;

  return {
    playbook_key: "vip_winback",
    title: `VIP Win-back — ${contacts.length} top customers gone quiet`,
    summary: `${contacts.length} customers with $1,500+ lifetime spend haven't purchased in 6+ months. A personal note from the shop — no discount — brings the best ones back.`,
    evidence: {
      points: [
        `${contacts.length} contacts over $1,500 lifetime spend with no purchase since ${sixMonthsAgo.slice(0, 10)}`,
        `Combined lifetime value $${Math.round(totalSpend).toLocaleString("en-AU")}`,
        `No discount — VIPs respond to recognition, not coupons`,
      ],
      metrics: { customers: contacts.length, combined_lifetime_spend: Math.round(totalSpend) },
    },
    contacts,
    expected_value: Math.round(expected),
    confidence: 0.6,
  };
}

export function detectConsumablesCadence(ctx: DetectorContext): DetectedOpportunity | null {
  type Due = { contact: ContactRow; label: string; daysSince: number };
  const lastByCustomerAndGroup = new Map<string, number>();

  for (const line of ctx.salesLines) {
    if (!line.customer_id || !line.complete_time) continue;
    const days = daysAgo(line.complete_time, ctx.now);
    if (days == null) continue;
    for (const group of CONSUMABLE_GROUPS) {
      if (!lineMatches(line, group.re)) continue;
      const key = `${line.customer_id}:${group.label}`;
      const prev = lastByCustomerAndGroup.get(key);
      if (prev == null || days < prev) lastByCustomerAndGroup.set(key, days);
    }
  }

  const dueByContact = new Map<string, Due>();
  for (const [key, days] of lastByCustomerAndGroup) {
    const sep = key.lastIndexOf(":");
    const customerId = key.slice(0, sep);
    const label = key.slice(sep + 1);
    const group = CONSUMABLE_GROUPS.find((g) => g.label === label);
    if (!group || days < group.dueFromDays || days > group.dueToDays) continue;
    const contact = ctx.contactsByCustomerId.get(customerId);
    if (!contact?.email) continue;
    if (!dueByContact.has(contact.id)) dueByContact.set(contact.id, { contact, label, daysSince: days });
  }

  const due = Array.from(dueByContact.values()).slice(0, MAX_TARGETS_PER_PLAY);
  if (due.length < 3) return null;

  const contacts = due.map((d) =>
    toTarget(d.contact, `${d.label} bought ${Math.round(d.daysSince / 30)} months ago — likely due`),
  );
  const expected = contacts.length * 60 * 0.1;

  return {
    playbook_key: "consumables_cadence",
    title: `Consumables Cadence — ${contacts.length} riders due wear parts`,
    summary: `${contacts.length} customers bought chains, tyres or brake pads long enough ago that they're due for replacement. A well-timed reminder wins predictable small baskets.`,
    evidence: {
      points: [
        `${contacts.length} customers past the typical wear interval for a consumable they bought here`,
        `Windows: chains 5–10 months, tyres 6–11 months, brake pads 4–9 months since purchase`,
      ],
      metrics: { customers: contacts.length },
    },
    contacts,
    expected_value: Math.round(expected),
    confidence: 0.55,
  };
}

/** Product ids queued in an active or upcoming Specials carousel cycle. */
async function fetchSpecialsCycleProductIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data: cycles, error: cyclesError } = await supabase
    .from("store_specials_cycles")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "upcoming"])
    .limit(50);
  if (cyclesError || !cycles || cycles.length === 0) return ids;

  const { data: items, error: itemsError } = await supabase
    .from("store_specials_cycle_items")
    .select("product_id, is_removed")
    .eq("user_id", userId)
    .in("cycle_id", cycles.map((c) => (c as { id: string }).id))
    .limit(2000);
  if (itemsError) return ids;

  for (const row of (items ?? []) as Array<{ product_id: string; is_removed: boolean }>) {
    if (!row.is_removed) ids.add(row.product_id);
  }
  return ids;
}

export async function detectDeadStockMover(ctx: DetectorContext): Promise<DetectedOpportunity | null> {
  const { supabase, userId, config } = ctx;

  const [{ data, error }, salesByItemId, specialsProductIds] = await Promise.all([
    supabase
      .from("marketplace_ready_products")
      .select(SPECIALS_PRODUCT_COLUMNS)
      .eq("user_id", userId)
      .gt("qoh", 0)
      .or("discount_active.is.null,discount_active.eq.false")
      .limit(600),
    fetchSalesAggregates(supabase, userId, ctx.now),
    fetchSpecialsCycleProductIds(supabase, userId),
  ]);
  if (error) {
    console.error("[domestique/detectors] dead_stock product fetch failed:", error.message);
    return null;
  }

  const engineConfig = {
    min_discount_percent: 10,
    max_discount_percent: config.max_discount_percent,
    min_margin_floor_percent: config.min_margin_floor_percent,
    discount_aggressiveness: 0.5,
    stale_days_threshold: 120,
  };

  const candidates: Array<{ item: DomestiqueDiscountItem; score: number }> = [];
  for (const row of (data ?? []) as RawSpecialsProductRow[]) {
    const metrics = buildProductMetrics(row, salesByItemId, ctx.now);
    if (metrics.retail <= 0) continue;
    const score = clearanceScore(metrics, engineConfig.stale_days_threshold);
    if (score < 0.55) continue;
    const proposal = proposeDiscount(metrics, engineConfig);
    if (proposal.discount_percent < 10) continue;
    candidates.push({
      score,
      item: {
        product_id: metrics.product_id,
        lightspeed_item_id: metrics.lightspeed_item_id,
        name: metrics.display_name,
        image_url: metrics.image_url,
        category_name: metrics.category_name,
        retail: metrics.retail,
        cost: metrics.cost,
        soh: metrics.soh,
        days_since_sold: metrics.days_since_sold,
        discount_percent: proposal.discount_percent,
        sale_price: proposal.sale_price,
        margin_at_sale: metrics.cost > 0 ? marginAtDiscount(metrics.retail, metrics.cost, proposal.discount_percent) : null,
        reason: proposal.reason,
        in_specials_cycle: specialsProductIds.has(metrics.product_id),
      },
    });
  }

  if (candidates.length < 3) return null;
  candidates.sort((a, b) => b.score - a.score);
  const discounts = candidates.slice(0, 8).map((c) => c.item);

  const costRecovered = discounts.reduce((sum, d) => sum + d.cost * Math.min(d.soh, 2), 0);
  const expected = discounts.reduce((sum, d) => sum + d.sale_price * Math.min(d.soh, 2), 0) * 0.2;
  const inSpecialsCount = discounts.filter((d) => d.in_specials_cycle).length;

  const points = [
    `${discounts.length} products scored ≥ 0.55 on the clearance index (staleness, velocity, overstock)`,
    `Every discount capped so margin never drops below ${config.min_margin_floor_percent}%`,
    `~$${Math.round(costRecovered).toLocaleString("en-AU")} of cost tied up in the first two units of each line`,
    `Discounts run for 7 days from approval, then expire automatically and full price returns`,
  ];
  if (inSpecialsCount > 0) {
    points.push(
      `${inSpecialsCount} of these ${inSpecialsCount === 1 ? "is" : "are"} also queued in your Specials carousel — flagged below so you can remove ${inSpecialsCount === 1 ? "it" : "them"} from this play if you prefer`,
    );
  }

  return {
    playbook_key: "dead_stock_mover",
    title: `Dead-Stock Mover — ${discounts.length} stale lines ready to clear`,
    summary: `${discounts.length} products past 120 days with weak sell-through. Margin-floored discounts (never below ${config.min_margin_floor_percent}% margin) go live on the storefront to free trapped cash.`,
    evidence: {
      points,
      metrics: {
        products: discounts.length,
        cost_recovered_estimate: Math.round(costRecovered),
        max_discount_percent: config.max_discount_percent,
        in_specials_cycle: inSpecialsCount,
      },
    },
    contacts: [],
    discounts,
    expected_value: Math.round(expected),
    confidence: 0.7,
  };
}

/** Run every enabled detector and collect findings. */
export async function runDetectors(ctx: DetectorContext): Promise<DetectedOpportunity[]> {
  const enabled = new Set(ctx.config.enabled_playbooks);
  const findings: DetectedOpportunity[] = [];

  const push = (found: DetectedOpportunity | null) => {
    if (found) findings.push(found);
  };

  if (enabled.has("service_chase")) push(detectServiceChase(ctx));
  if (enabled.has("first_service_rescue")) push(detectFirstServiceRescue(ctx));
  if (enabled.has("consumables_cadence")) push(detectConsumablesCadence(ctx));
  if (enabled.has("vip_winback")) push(await detectVipWinback(ctx));
  if (enabled.has("dead_stock_mover")) push(await detectDeadStockMover(ctx));

  return findings;
}
