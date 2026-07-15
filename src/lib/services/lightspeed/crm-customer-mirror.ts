import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { projectCustomerTimelineForUser } from "@/lib/crm/customer-event-projection";
import { syncStoreLoyaltyFromSales } from "@/lib/crm/loyalty";
import { createLightspeedClient } from "./lightspeed-client";
import type {
  LightspeedContactEmail,
  LightspeedContactPhone,
  LightspeedCustomer,
  LightspeedCustomerBike,
  LightspeedWorkorderStatus,
  LightspeedWorkorderWithRelations,
} from "./types";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

const CUSTOMER_OVERLAP_MS = 10 * 60 * 1000;
/** Cron incremental / continued backfill pages (100 customers each). */
const CUSTOMER_PAGE_LIMIT = 50;
/** Manual / forced full sync pages — matches email import coverage. */
const CUSTOMER_FULL_SYNC_PAGE_LIMIT = 300;
const BIKE_CUSTOMERS_PER_RUN = 25;
const WORKORDERS_PER_RUN = 250;
const UPSERT_CHUNK = 200;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normaliseEmail(value: unknown): string | null {
  const email = clean(value)?.toLowerCase() ?? null;
  return email && email.includes("@") ? email : null;
}

function normalisePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("61") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

function customerEmail(customer: LightspeedCustomer): string | null {
  const emails = asArray<LightspeedContactEmail>(customer.Contact?.Emails?.ContactEmail);
  const primary = emails.find((entry) => entry.useType?.toLowerCase() === "primary");
  return normaliseEmail(primary?.address)
    ?? emails.map((entry) => normaliseEmail(entry.address)).find(Boolean)
    ?? null;
}

function customerPhone(customer: LightspeedCustomer): string | null {
  const contact = customer.Contact;
  if (!contact) return null;
  const flat = [contact.mobile, contact.phoneHome, contact.phoneWork]
    .map(normalisePhone)
    .find(Boolean);
  if (flat) return flat;

  const phones = asArray<LightspeedContactPhone>(contact.Phones?.ContactPhone);
  const mobile = phones.find((entry) => entry.useType?.toLowerCase() === "mobile");
  return normalisePhone(mobile?.number) ?? phones.map((entry) => normalisePhone(entry.number)).find(Boolean) ?? null;
}

function customerName(customer: LightspeedCustomer): {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
} {
  const firstName = clean(customer.firstName);
  const lastName = clean(customer.lastName);
  const displayName = [firstName, lastName].filter(Boolean).join(" ")
    || clean(customer.company)
    || customerEmail(customer)
    || customerPhone(customer)
    || "Customer";
  return { displayName, firstName, lastName };
}

function boolString(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function parseTimestamp(value: unknown): number {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toIsoOrNull(value: unknown): string | null {
  const timestamp = parseTimestamp(value);
  return timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

function chunk<T>(values: T[], size = UPSERT_CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function dedupeByKey<T extends Record<string, unknown>>(
  values: T[],
  keyFor: (value: T) => string,
): T[] {
  const byKey = new Map<string, T>();
  for (const value of values) {
    byKey.set(keyFor(value), value);
  }
  return [...byKey.values()];
}

async function requireStore(admin: AdminClient, userId: string): Promise<{ id: string }> {
  const { data: store, error } = await admin
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load CRM store: ${error.message}`);
  if (store) return store;

  // Auto-bootstrap the CRM store row for verified bike-store accounts that
  // pre-date (or skipped) the foundation backfill.
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("business_name, account_type, bicycle_store")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) {
    throw new Error(`Could not load store profile for CRM bootstrap: ${profileError.message}`);
  }
  if (profile?.account_type !== "bicycle_store" || profile.bicycle_store !== true) {
    throw new Error("CRM store foundation is not initialised for this Lightspeed connection.");
  }

  const storeName = clean(profile.business_name) || "Bike store";
  const { data: created, error: createError } = await admin
    .from("stores")
    .upsert(
      {
        owner_user_id: userId,
        name: storeName,
        crm_enabled: true,
      },
      { onConflict: "owner_user_id" },
    )
    .select("id")
    .maybeSingle();
  if (createError || !created) {
    throw new Error(
      `Could not bootstrap CRM store: ${createError?.message ?? "store row was not created"}`,
    );
  }

  await admin.from("store_memberships").upsert(
    {
      store_id: created.id,
      user_id: userId,
      role: "owner",
      status: "active",
    },
    { onConflict: "store_id,user_id" },
  );

  return created;
}

async function setSyncState(
  admin: AdminClient,
  storeId: string,
  source: "lightspeed_customers" | "lightspeed_workorders" | "lightspeed_bikes" | "timeline",
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("store_crm_sync_state")
    .upsert(
      {
        store_id: storeId,
        source,
        updated_at: new Date().toISOString(),
        ...patch,
      },
      { onConflict: "store_id,source" },
    );
  if (error) throw new Error(`Could not update ${source} sync state: ${error.message}`);
}

async function syncSince(
  admin: AdminClient,
  storeId: string,
  source: string,
): Promise<string | null> {
  const { data } = await admin
    .from("store_crm_sync_state")
    .select("last_successful_at")
    .eq("store_id", storeId)
    .eq("source", source)
    .maybeSingle();
  if (!data?.last_successful_at) return null;
  return new Date(Date.parse(data.last_successful_at) - CUSTOMER_OVERLAP_MS).toISOString();
}

type CustomerSyncStateRow = {
  last_successful_at: string | null;
  metadata: Record<string, unknown> | null;
};

async function loadCustomerSyncState(
  admin: AdminClient,
  storeId: string,
): Promise<CustomerSyncStateRow | null> {
  const { data, error } = await admin
    .from("store_crm_sync_state")
    .select("last_successful_at, metadata")
    .eq("store_id", storeId)
    .eq("source", "lightspeed_customers")
    .maybeSingle();
  if (error) throw new Error(`Could not load customer sync state: ${error.message}`);
  if (!data) return null;
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : null;
  return {
    last_successful_at: data.last_successful_at ? String(data.last_successful_at) : null,
    metadata,
  };
}

/**
 * Decide the Lightspeed timeStamp cursor for customer mirroring.
 *
 * Until a full pass completes without hitting the page cap, keep walking ascending
 * timeStamp from the watermark. If a prior run incorrectly marked itself complete
 * (common when an empty/partial batch advanced the cursor to "now"), restart from
 * the beginning so older customers are not permanently skipped.
 */
function resolveCustomerSyncSince(
  state: CustomerSyncStateRow | null,
  options: { fullSync?: boolean },
): string | null {
  if (options.fullSync) return null;

  const metadata = state?.metadata ?? {};
  const backfillComplete = metadata.backfill_complete === true;
  const hitPageLimit = metadata.hit_page_limit === true;
  const lastSuccessfulAt = state?.last_successful_at;
  if (!lastSuccessfulAt) return null;

  if (backfillComplete || hitPageLimit) {
    return new Date(Date.parse(lastSuccessfulAt) - CUSTOMER_OVERLAP_MS).toISOString();
  }

  // Prior runs never recorded a finished backfill. Restart from the oldest
  // customers so the catalogue is rebuilt completely.
  return null;
}

async function existingCustomersByLightspeedId(
  admin: AdminClient,
  storeId: string,
  lightspeedIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const ids of chunk([...new Set(lightspeedIds.filter(Boolean))])) {
    const { data, error } = await admin
      .from("store_customers")
      .select("id, lightspeed_customer_id")
      .eq("store_id", storeId)
      .in("lightspeed_customer_id", ids);
    if (error) throw new Error(`Could not resolve mirrored customers: ${error.message}`);
    for (const row of data ?? []) {
      if (row.lightspeed_customer_id) result.set(String(row.lightspeed_customer_id), String(row.id));
    }
  }
  return result;
}

async function existingBikesBySerializedId(
  admin: AdminClient,
  storeId: string,
  serializedIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const ids of chunk([...new Set(serializedIds.filter(Boolean))])) {
    const { data, error } = await admin
      .from("store_customer_bikes")
      .select("id, lightspeed_serialized_id")
      .eq("store_id", storeId)
      .in("lightspeed_serialized_id", ids);
    if (error) throw new Error(`Could not resolve mirrored bikes: ${error.message}`);
    for (const row of data ?? []) {
      if (row.lightspeed_serialized_id) {
        result.set(String(row.lightspeed_serialized_id), String(row.id));
      }
    }
  }
  return result;
}

export type CrmMirrorResult = {
  source: "lightspeed_customers" | "lightspeed_workorders" | "lightspeed_bikes";
  processed: number;
  pagesFetched?: number;
  hitPageLimit?: boolean;
};

export async function syncCrmCustomersForUser(args: {
  userId: string;
  admin?: AdminClient;
  maxPages?: number;
  /** Ignore sync cursor and re-pull from the oldest Lightspeed customers. */
  fullSync?: boolean;
}): Promise<CrmMirrorResult> {
  const admin = args.admin ?? createServiceRoleClient();
  const store = await requireStore(admin, args.userId);
  const startedAt = new Date().toISOString();
  const previousState = await loadCustomerSyncState(admin, store.id);
  await setSyncState(admin, store.id, "lightspeed_customers", {
    status: "running",
    last_started_at: startedAt,
    last_error: null,
  });

  try {
    const since = resolveCustomerSyncSince(previousState, { fullSync: args.fullSync });
    const maxPages = args.maxPages
      ?? (args.fullSync || since === null ? CUSTOMER_FULL_SYNC_PAGE_LIMIT : CUSTOMER_PAGE_LIMIT);
    const client = createLightspeedClient(args.userId);
    const { customers, pagesFetched, hitPageLimit } = await client.getAllCustomersCursor(
      {
        archived: "false",
        load_relations: '["Contact"]',
        sort: "timeStamp",
        ...(since ? { timeStamp: `>,${since}` } : {}),
      },
      {
        limit: 100,
        maxPages,
      },
    );

    const existing = await existingCustomersByLightspeedId(
      admin,
      store.id,
      customers.map((customer) => String(customer.customerID ?? "")).filter(Boolean),
    );
    const now = new Date().toISOString();
    const rows = customers.flatMap((customer) => {
      const lightspeedId = clean(customer.customerID);
      if (!lightspeedId) return [];
      const name = customerName(customer);
      return [{
        id: existing.get(lightspeedId) ?? randomUUID(),
        store_id: store.id,
        user_id: args.userId,
        display_name: name.displayName,
        first_name: name.firstName,
        last_name: name.lastName,
        primary_email: customerEmail(customer),
        primary_phone: customerPhone(customer),
        lightspeed_customer_id: lightspeedId,
        data_freshness_at: now,
        source: "lightspeed",
        metadata: {
          lightspeed_create_time: clean(customer.createTime),
          lightspeed_timestamp: clean(customer.timeStamp),
          no_email: boolString(customer.Contact?.noEmail),
          no_phone: boolString(customer.Contact?.noPhone),
        },
      }];
    });

    for (const part of chunk(rows)) {
      const { error } = await admin.from("store_customers").upsert(part, { onConflict: "id" });
      if (error) throw new Error(`Could not upsert CRM customers: ${error.message}`);
    }

    const customerIdByLightspeedId = new Map(
      rows.map((row) => [String(row.lightspeed_customer_id), String(row.id)]),
    );
    const identities: Record<string, unknown>[] = [];
    const consents: Record<string, unknown>[] = [];

    for (const customer of customers) {
      const lightspeedId = clean(customer.customerID);
      if (!lightspeedId) continue;
      const customerId = customerIdByLightspeedId.get(lightspeedId);
      if (!customerId) continue;
      const email = customerEmail(customer);
      const phone = customerPhone(customer);

      identities.push({
        store_id: store.id,
        customer_id: customerId,
        identity_type: "lightspeed_customer_id",
        normalized_value: lightspeedId,
        display_value: lightspeedId,
        source: "lightspeed",
        verification_status: "verified",
        match_confidence: 1,
        last_seen_at: now,
      });
      if (email) {
        identities.push({
          store_id: store.id,
          customer_id: customerId,
          identity_type: "email",
          normalized_value: email,
          display_value: email,
          source: "lightspeed",
          verification_status: "observed",
          match_confidence: 1,
          last_seen_at: now,
        });
        consents.push({
          store_id: store.id,
          customer_id: customerId,
          channel: "email",
          purpose: "marketing",
          status: boolString(customer.Contact?.noEmail) ? "denied" : "unknown",
          lawful_basis: "unknown",
          source: "lightspeed",
          evidence: {
            lightspeed_customer_id: lightspeedId,
            noEmail: customer.Contact?.noEmail ?? null,
          },
          captured_at: now,
          withdrawn_at: boolString(customer.Contact?.noEmail) ? now : null,
        });
      }
      if (phone) {
        identities.push({
          store_id: store.id,
          customer_id: customerId,
          identity_type: "phone",
          normalized_value: phone,
          display_value: phone,
          source: "lightspeed",
          verification_status: "observed",
          match_confidence: 1,
          last_seen_at: now,
        });
        consents.push({
          store_id: store.id,
          customer_id: customerId,
          channel: "sms",
          purpose: "marketing",
          status: boolString(customer.Contact?.noPhone) ? "denied" : "unknown",
          lawful_basis: "unknown",
          source: "lightspeed",
          evidence: {
            lightspeed_customer_id: lightspeedId,
            noPhone: customer.Contact?.noPhone ?? null,
          },
          captured_at: now,
          withdrawn_at: boolString(customer.Contact?.noPhone) ? now : null,
        });
      }
    }

    const uniqueIdentities = dedupeByKey(
      identities,
      (identity) =>
        `${identity.store_id}|${identity.identity_type}|${identity.normalized_value}`,
    );
    const uniqueConsents = dedupeByKey(
      consents,
      (consent) =>
        `${consent.store_id}|${consent.customer_id}|${consent.channel}|${consent.purpose}`,
    );

    for (const part of chunk(uniqueIdentities)) {
      const { error } = await admin.from("store_customer_identities").upsert(part, {
        onConflict: "store_id,identity_type,normalized_value",
      });
      if (error) throw new Error(`Could not upsert customer identities: ${error.message}`);
    }
    for (const part of chunk(uniqueConsents)) {
      const { error } = await admin.from("store_customer_consents").upsert(part, {
        onConflict: "store_id,customer_id,channel,purpose",
      });
      if (error) throw new Error(`Could not upsert customer consent: ${error.message}`);
    }

    for (const [lightspeedId, customerId] of customerIdByLightspeedId) {
      await admin
        .from("crm_contacts")
        .update({ customer_id: customerId })
        .eq("user_id", args.userId)
        .eq("lightspeed_customer_id", lightspeedId)
        .is("customer_id", null);
    }

    const mirroredCustomerIds = [...customerIdByLightspeedId.values()];
    for (const ids of chunk(mirroredCustomerIds)) {
      const { data: contactStats, error: statsError } = await admin
        .from("crm_contacts")
        .select("customer_id, total_spend, sale_count, last_purchase_at, enriched_at")
        .eq("user_id", args.userId)
        .in("customer_id", ids);
      if (statsError) throw new Error(`Could not load customer value stats: ${statsError.message}`);
      for (const stats of contactStats ?? []) {
        const count = Number(stats.sale_count ?? 0);
        const spend = Number(stats.total_spend ?? 0);
        await admin
          .from("store_customers")
          .update({
            total_spend: Number.isFinite(spend) ? spend : 0,
            sale_count: Number.isFinite(count) ? count : 0,
            average_sale: count > 0 ? spend / count : 0,
            last_purchase_at: stats.last_purchase_at,
            data_freshness_at: stats.enriched_at ?? now,
          })
          .eq("store_id", store.id)
          .eq("id", stats.customer_id);
      }
    }

    const latestSourceTimestamp = customers.reduce(
      (latest, customer) => Math.max(latest, parseTimestamp(customer.timeStamp)),
      0,
    );
    const completedAt = new Date().toISOString();
    const previousSuccessfulAt = previousState?.last_successful_at
      ? Date.parse(previousState.last_successful_at)
      : 0;

    // Never jump the cursor to "now" on an empty batch — that permanently skips
    // older Lightspeed customers on the next incremental sync.
    let nextSuccessfulAt = completedAt;
    if (latestSourceTimestamp > 0) {
      nextSuccessfulAt = new Date(latestSourceTimestamp).toISOString();
    } else if (previousSuccessfulAt > 0) {
      nextSuccessfulAt = new Date(previousSuccessfulAt).toISOString();
    }

    const backfillComplete = !hitPageLimit;

    await setSyncState(admin, store.id, "lightspeed_customers", {
      status: "completed",
      last_completed_at: completedAt,
      last_successful_at: nextSuccessfulAt,
      records_processed: rows.length,
      metadata: {
        pages_fetched: pagesFetched,
        hit_page_limit: hitPageLimit,
        backfill_complete: backfillComplete,
        sync_since: since,
        full_sync: Boolean(args.fullSync),
      },
    });

    return {
      source: "lightspeed_customers",
      processed: rows.length,
      pagesFetched,
      hitPageLimit,
    };
  } catch (error) {
    await setSyncState(admin, store.id, "lightspeed_customers", {
      status: "failed",
      last_completed_at: new Date().toISOString(),
      last_error: error instanceof Error ? error.message : "Customer mirror failed",
    }).catch(() => undefined);
    throw error;
  }
}

function workorderStatus(
  workorder: LightspeedWorkorderWithRelations,
  statuses: Map<string, LightspeedWorkorderStatus>,
): LightspeedWorkorderStatus | undefined {
  return workorder.WorkorderStatus
    ?? statuses.get(String(workorder.workorderStatusID ?? ""));
}

function workorderState(status: LightspeedWorkorderStatus | undefined): string {
  const system = String(status?.systemValue ?? "").toLowerCase();
  const name = String(status?.name ?? "").toLowerCase();
  if (system.includes("finished") || system.includes("complete") || name.includes("complete")) {
    return "completed";
  }
  if (name.includes("part")) return "waiting_for_parts";
  if (name.includes("ready")) return "ready";
  if (name.includes("progress") || name.includes("repair")) return "in_progress";
  return "open";
}

export async function syncCrmWorkordersForUser(args: {
  userId: string;
  admin?: AdminClient;
  targetCount?: number;
}): Promise<CrmMirrorResult> {
  const admin = args.admin ?? createServiceRoleClient();
  const store = await requireStore(admin, args.userId);
  await setSyncState(admin, store.id, "lightspeed_workorders", {
    status: "running",
    last_started_at: new Date().toISOString(),
    last_error: null,
  });

  try {
    const client = createLightspeedClient(args.userId);
    const since = await syncSince(admin, store.id, "lightspeed_workorders");
    const [statuses, workorders] = await Promise.all([
      client.getWorkorderStatuses(),
      client.getRecentWorkorders(
        {
          archived: "false",
          sort: "timeStamp",
          load_relations: '["Customer","WorkorderLines","WorkorderStatus"]',
          ...(since ? { timeStamp: `>,${since}` } : {}),
        },
        {
          limit: 100,
          maxPages: 5,
          targetCount: args.targetCount ?? WORKORDERS_PER_RUN,
        },
      ),
    ]);
    const statusById = new Map(statuses.map((status) => [String(status.workorderStatusID), status]));
    const customerIds = await existingCustomersByLightspeedId(
      admin,
      store.id,
      workorders.map((workorder) => String(workorder.customerID ?? "")).filter(Boolean),
    );

    const serializedIds = workorders
      .map((workorder) => String(workorder.serializedID ?? "").trim())
      .filter(Boolean);
    const bikeIds = await existingBikesBySerializedId(admin, store.id, serializedIds);
    const now = new Date().toISOString();
    const rows = workorders.flatMap((workorder) => {
      const workorderId = clean(workorder.workorderID);
      if (!workorderId) return [];
      const status = workorderStatus(workorder, statusById);
      const state = workorderState(status);
      return [{
        store_id: store.id,
        customer_id: customerIds.get(String(workorder.customerID ?? "")) ?? null,
        bike_id: bikeIds.get(String(workorder.serializedID ?? "")) ?? null,
        lightspeed_workorder_id: workorderId,
        workorder_number: workorderId,
        status: state,
        status_label: clean(status?.name) ?? "Open",
        title: clean(workorder.note) ?? "Workshop job",
        description: clean(workorder.internalNote),
        promised_at: toIsoOrNull(workorder.etaOut),
        completed_at: state === "completed" ? toIsoOrNull(workorder.timeStamp) : null,
        data_freshness_at: now,
        payload: {
          sale_id: clean(workorder.saleID),
          sale_line_id: clean(workorder.saleLineID),
          warranty: boolString(workorder.warranty),
          employee_id: clean(workorder.employeeID),
          shop_id: clean(workorder.shopID),
          workorder_lines: asArray(workorder.WorkorderLines?.WorkorderLine),
        },
      }];
    });

    for (const part of chunk(rows)) {
      const { error } = await admin.from("store_customer_workorders").upsert(part, {
        onConflict: "store_id,lightspeed_workorder_id",
      });
      if (error) throw new Error(`Could not upsert work orders: ${error.message}`);
    }

    const linkedRows = rows.filter((row) => row.customer_id);
    for (const row of linkedRows) {
      const occurredAt = row.completed_at ?? row.promised_at ?? now;
      const { error } = await admin.from("store_customer_events").upsert({
        store_id: store.id,
        customer_id: row.customer_id,
        event_type: "workorder_status",
        channel: "workshop",
        source_type: "lightspeed_workorder",
        source_id: row.lightspeed_workorder_id,
        title: row.title,
        summary: row.status_label,
        occurred_at: occurredAt,
        actor_type: "system",
        direction: "internal",
        metadata: {
          status: row.status,
          promised_at: row.promised_at,
        },
      }, { onConflict: "store_id,source_type,source_id,event_type" });
      if (error) throw new Error(`Could not append work-order event: ${error.message}`);
    }

    const latest = workorders.reduce(
      (value, workorder) => Math.max(value, parseTimestamp(workorder.timeStamp)),
      0,
    );
    const completedAt = new Date().toISOString();
    await setSyncState(admin, store.id, "lightspeed_workorders", {
      status: "completed",
      last_completed_at: completedAt,
      last_successful_at: latest > 0 ? new Date(latest).toISOString() : completedAt,
      records_processed: rows.length,
    });
    return { source: "lightspeed_workorders", processed: rows.length };
  } catch (error) {
    await setSyncState(admin, store.id, "lightspeed_workorders", {
      status: "failed",
      last_completed_at: new Date().toISOString(),
      last_error: error instanceof Error ? error.message : "Work-order mirror failed",
    }).catch(() => undefined);
    throw error;
  }
}

function bikeRow(args: {
  bike: LightspeedCustomerBike;
  bikeId: string;
  storeId: string;
  customerId: string;
  now: string;
}): Record<string, unknown> {
  const nextService = new Date(Date.parse(args.now) + 365 * 24 * 60 * 60 * 1000).toISOString();
  const label = clean(args.bike.label);
  return {
    id: args.bikeId,
    store_id: args.storeId,
    customer_id: args.customerId,
    lightspeed_serialized_id: args.bike.serializedId,
    serial_number: clean(args.bike.serial),
    model: label,
    colour: clean(args.bike.colorName),
    next_service_due_at: nextService,
    service_interval_days: 365,
    source: "lightspeed",
    source_confidence: 1,
    data_freshness_at: args.now,
    metadata: {
      item_id: args.bike.itemId,
      sale_line_id: args.bike.saleLineId,
      size_name: args.bike.sizeName,
      source_updated_at: args.bike.updatedAt,
    },
  };
}

export async function syncCrmBikesForUser(args: {
  userId: string;
  admin?: AdminClient;
  maxCustomers?: number;
}): Promise<CrmMirrorResult> {
  const admin = args.admin ?? createServiceRoleClient();
  const store = await requireStore(admin, args.userId);
  await setSyncState(admin, store.id, "lightspeed_bikes", {
    status: "running",
    last_started_at: new Date().toISOString(),
    last_error: null,
  });

  try {
    const { data: customers, error } = await admin
      .from("store_customers")
      .select("id, lightspeed_customer_id")
      .eq("store_id", store.id)
      .eq("status", "active")
      .not("lightspeed_customer_id", "is", null)
      .order("data_freshness_at", { ascending: true, nullsFirst: true })
      .limit(args.maxCustomers ?? BIKE_CUSTOMERS_PER_RUN);
    if (error) throw new Error(`Could not load customers for bike mirror: ${error.message}`);

    const client = createLightspeedClient(args.userId);
    const fetched: Array<{ customerId: string; bike: LightspeedCustomerBike }> = [];
    for (const customer of customers ?? []) {
      const bikes = await client
        .getCustomerBikes(String(customer.lightspeed_customer_id))
        .catch((bikeError) => {
          console.warn("[crm-mirror] Could not mirror customer bikes:", bikeError);
          return [];
        });
      for (const bike of bikes) fetched.push({ customerId: String(customer.id), bike });
    }

    const existing = await existingBikesBySerializedId(
      admin,
      store.id,
      fetched.map(({ bike }) => bike.serializedId),
    );
    const now = new Date().toISOString();
    const rows = fetched.map(({ customerId, bike }) => bikeRow({
      bike,
      bikeId: existing.get(bike.serializedId) ?? randomUUID(),
      storeId: store.id,
      customerId,
      now,
    }));

    for (const part of chunk(rows)) {
      const { error: upsertError } = await admin
        .from("store_customer_bikes")
        .upsert(part, { onConflict: "id" });
      if (upsertError) throw new Error(`Could not upsert customer bikes: ${upsertError.message}`);
    }

    await setSyncState(admin, store.id, "lightspeed_bikes", {
      status: "completed",
      last_completed_at: now,
      last_successful_at: now,
      records_processed: rows.length,
      metadata: { customers_checked: customers?.length ?? 0 },
    });
    return { source: "lightspeed_bikes", processed: rows.length };
  } catch (error) {
    await setSyncState(admin, store.id, "lightspeed_bikes", {
      status: "failed",
      last_completed_at: new Date().toISOString(),
      last_error: error instanceof Error ? error.message : "Bike mirror failed",
    }).catch(() => undefined);
    throw error;
  }
}

export async function syncCrmMirrorsForUser(args: {
  userId: string;
  admin?: AdminClient;
  /** Force a full Lightspeed customer re-pull (ignores sync cursor). */
  fullCustomerSync?: boolean;
}): Promise<CrmMirrorResult[]> {
  const admin = args.admin ?? createServiceRoleClient();
  const results: CrmMirrorResult[] = [];
  results.push(await syncCrmCustomersForUser({
    userId: args.userId,
    admin,
    fullSync: args.fullCustomerSync,
  }));
  results.push(await syncCrmWorkordersForUser({ userId: args.userId, admin }));
  results.push(await syncCrmBikesForUser({ userId: args.userId, admin }));
  await projectCustomerTimelineForUser({ userId: args.userId, admin });
  await syncStoreLoyaltyFromSales({ userId: args.userId, admin });
  return results;
}

export async function syncCrmMirrorsForConnectedUsers(args?: {
  admin?: SupabaseClient;
  maxUsers?: number;
}): Promise<{
  storesChecked: number;
  succeeded: number;
  failed: number;
  results: Array<{ userId: string; success: boolean; mirrors?: CrmMirrorResult[]; error?: string }>;
}> {
  const admin = (args?.admin as AdminClient | undefined) ?? createServiceRoleClient();
  const maxUsers = Math.min(Math.max(args?.maxUsers ?? 5, 1), 25);
  const { data: connections, error } = await admin
    .from("lightspeed_connections")
    .select("user_id")
    .eq("status", "connected")
    .not("access_token_encrypted", "is", null)
    .limit(maxUsers);
  if (error) throw new Error(`Could not load connected stores for CRM mirror: ${error.message}`);

  const results: Array<{
    userId: string;
    success: boolean;
    mirrors?: CrmMirrorResult[];
    error?: string;
  }> = [];
  for (const connection of connections ?? []) {
    try {
      const mirrors = await syncCrmMirrorsForUser({
        userId: String(connection.user_id),
        admin,
      });
      results.push({ userId: String(connection.user_id), success: true, mirrors });
    } catch (syncError) {
      results.push({
        userId: String(connection.user_id),
        success: false,
        error: syncError instanceof Error ? syncError.message : "CRM mirror failed",
      });
    }
  }

  return {
    storesChecked: connections?.length ?? 0,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}
