import type { SupabaseClient } from "@supabase/supabase-js";
import { BIKE_PROGRAMMES } from "../programmes";
import {
  CUSTOMER_LIFECYCLE_LABELS,
  CUSTOMER_LIFECYCLE_STAGES,
  TODAY_GROUP_LABELS,
  type AgentAction,
  type AgentActionSource,
  type AgentActionStatus,
  type AgentRiskTier,
  type AutomationRunSummary,
  type AutomationSummary,
  type AutomationSummaryResponse,
  type ConsentChannel,
  type ConsentPurpose,
  type ConsentStatus,
  type CustomerBike,
  type CustomerConsent,
  type CustomerEvent,
  type CustomerEventKind,
  type CustomerIdentity,
  type CustomerIdentityKind,
  type CustomerLifecycleStage,
  type CustomerListResponse,
  type CustomerProfile,
  type CustomerSearchFilters,
  type CustomerSearchSort,
  type CustomerSummary,
  type CustomerTask,
  type CustomerTimelineResponse,
  type CustomerWorkorder,
  type CustomerWorkorderStatus,
  type JsonValue,
  type KeysetCursor,
  type TaskPriority,
  type TaskStatus,
  type TimelineCursor,
  type TodayGroup,
  type TodayGroupKey,
  type TodayItem,
  type TodayQueue,
} from "./types";
import { decodeKeysetCursor, encodeKeysetCursor, rankTodayItems } from "./ranking";

const CUSTOMER_SELECT = [
  "id",
  "display_name",
  "first_name",
  "last_name",
  "primary_email",
  "primary_phone",
  "lightspeed_customer_id",
  "total_spend",
  "sale_count",
  "last_purchase_at",
  "lifecycle_stage",
  "last_interaction_at",
  "data_freshness_at",
  "created_at",
  "updated_at",
].join(",");

const OPEN_TASK_STATUSES: TaskStatus[] = ["open", "in_progress", "snoozed"];
const OPEN_ACTION_STATUSES: AgentActionStatus[] = [
  "draft",
  "proposed",
  "awaiting_approval",
  "approved",
  "snoozed",
];
const OPEN_INQUIRY_STATUSES = ["new", "processing", "draft_ready", "error"];
const DAY_MS = 86_400_000;

export class CrmRepositoryError extends Error {
  constructor(
    message: string,
    readonly operation: string,
  ) {
    super(message);
    this.name = "CrmRepositoryError";
  }
}

function rows(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

function relationUnavailable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01"
    || error.code === "PGRST205"
    || error.code === "PGRST202"
    || /relation .* does not exist|schema cache|function .* does not exist/i.test(error.message ?? "")
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonRecord(value: unknown): Record<string, JsonValue> {
  return record(value) as Record<string, JsonValue>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function lifecycleStage(value: unknown): CustomerLifecycleStage {
  return CUSTOMER_LIFECYCLE_STAGES.includes(value as CustomerLifecycleStage)
    ? (value as CustomerLifecycleStage)
    : "unknown";
}

function taskPriority(value: unknown): TaskPriority {
  if (typeof value === "number") {
    if (value >= 90) return "urgent";
    if (value >= 70) return "high";
    if (value < 30) return "low";
    return "normal";
  }
  return ["urgent", "high", "normal", "low"].includes(String(value))
    ? (value as TaskPriority)
    : "normal";
}

function taskStatus(value: unknown): TaskStatus {
  return ["open", "in_progress", "completed", "dismissed", "snoozed", "cancelled"].includes(
    String(value),
  )
    ? (value as TaskStatus)
    : "open";
}

function actionStatus(value: unknown): AgentActionStatus {
  return [
    "draft",
    "proposed",
    "awaiting_approval",
    "approved",
    "executing",
    "completed",
    "dismissed",
    "snoozed",
    "failed",
    "cancelled",
    "expired",
  ].includes(String(value))
    ? (value as AgentActionStatus)
    : "proposed";
}

function riskTier(value: unknown): AgentRiskTier {
  if (value === "autonomous") return "low";
  if (value === "strict") return "restricted";
  return ["low", "approval", "restricted"].includes(String(value))
    ? (value as AgentRiskTier)
    : "approval";
}

function channel(value: unknown): ConsentChannel | null {
  return ["email", "sms", "voice", "phone", "push", "in_app"].includes(String(value))
    ? (value as ConsentChannel)
    : null;
}

function cleanSearchQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@+.\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function postgrestLiteral(value: string | number): string {
  if (typeof value === "number") return String(value);
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function mapSummary(
  row: Record<string, unknown>,
  bikeCounts = new Map<string, number>(),
  taskDetails = new Map<string, { count: number; nextAt: string | null }>(),
): CustomerSummary {
  const id = String(row.id);
  const stage = lifecycleStage(row.lifecycle_stage);
  const tasks = taskDetails.get(id);
  return {
    id,
    displayName:
      stringOrNull(row.display_name) ??
      ([stringOrNull(row.first_name), stringOrNull(row.last_name)].filter(Boolean).join(" ") ||
        stringOrNull(row.primary_email) ||
        "Unnamed customer"),
    firstName: stringOrNull(row.first_name),
    lastName: stringOrNull(row.last_name),
    primaryEmail: stringOrNull(row.primary_email),
    primaryPhone: stringOrNull(row.primary_phone),
    lightspeedCustomerId: stringOrNull(row.lightspeed_customer_id),
    totalSpend: finiteNumber(row.total_spend),
    saleCount: Math.max(0, Math.trunc(finiteNumber(row.sale_count))),
    lastPurchaseAt: stringOrNull(row.last_purchase_at),
    lifecycleStage: stage,
    lifecycleLabel: CUSTOMER_LIFECYCLE_LABELS[stage],
    lastInteractionAt: stringOrNull(row.last_interaction_at),
    dataFreshnessAt: stringOrNull(row.data_freshness_at),
    bikeCount: bikeCounts.get(id) ?? 0,
    openTaskCount: tasks?.count ?? 0,
    nextActionAt: tasks?.nextAt ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapIdentity(row: Record<string, unknown>): CustomerIdentity {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    kind: String(row.identity_type ?? "external") as CustomerIdentityKind,
    value: String(row.display_value ?? row.normalized_value ?? ""),
    normalisedValue: String(row.normalized_value ?? ""),
    source: String(row.source ?? "unknown"),
    isPrimary: false,
    verifiedAt:
      row.verification_status === "verified" ? stringOrNull(row.last_seen_at) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

function mapConsent(row: Record<string, unknown>): CustomerConsent {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    channel: String(row.channel ?? "email") as ConsentChannel,
    purpose: String(row.purpose ?? "marketing") as ConsentPurpose,
    status: String(row.status ?? "unknown") as ConsentStatus,
    source: String(row.source ?? "unknown"),
    legalBasis: stringOrNull(row.lawful_basis),
    grantedAt: row.status === "granted" ? stringOrNull(row.captured_at) : null,
    withdrawnAt: stringOrNull(row.withdrawn_at),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapBike(row: Record<string, unknown>): CustomerBike {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    brand: stringOrNull(row.brand),
    model: stringOrNull(row.model),
    modelYear:
      row.model_year == null ? null : Math.trunc(finiteNumber(row.model_year)),
    serialNumber: stringOrNull(row.serial_number),
    frameSize: stringOrNull(jsonRecord(row.metadata).frame_size),
    colour: stringOrNull(row.colour),
    bikeType: stringOrNull(row.category),
    isEBike: booleanValue(row.is_ebike),
    purchaseDate: stringOrNull(row.purchased_at),
    lastServiceAt: stringOrNull(row.last_service_at),
    nextServiceDueAt: stringOrNull(row.next_service_due_at),
    warrantyExpiresAt: stringOrNull(row.warranty_expires_at),
    source: String(row.source ?? "unknown"),
    sourceId: stringOrNull(row.lightspeed_serialized_id),
    metadata: jsonRecord(row.metadata),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapTask(row: Record<string, unknown>): CustomerTask {
  return {
    id: String(row.id),
    customerId: stringOrNull(row.customer_id),
    kind: String(row.task_type ?? "follow_up"),
    title: String(row.title ?? "Follow up"),
    summary: stringOrNull(row.reason),
    status: taskStatus(row.status),
    priority: taskPriority(row.priority),
    dueAt: stringOrNull(row.due_at),
    snoozedUntil: stringOrNull(row.snoozed_until),
    source: String(row.source_type ?? "crm"),
    sourceId: stringOrNull(row.source_id),
    actionId: stringOrNull(jsonRecord(row.payload).action_id),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapAction(row: Record<string, unknown>): AgentAction {
  return {
    id: String(row.id),
    customerId: stringOrNull(row.customer_id),
    taskId: null,
    source: "agent",
    sourceId: String(row.id),
    actionType: String(row.action_type ?? "unknown"),
    title: String(row.title ?? "Proposed action"),
    summary: stringOrNull(row.reasoning),
    status: actionStatus(row.status),
    riskTier: riskTier(row.risk_tier),
    channel: channel(row.channel),
    proposal: jsonRecord(row.proposed_payload),
    decisionReason: stringOrNull(jsonRecord(row.policy_decision).reason),
    dueAt: stringOrNull(row.expires_at),
    snoozedUntil: stringOrNull(row.snoozed_until),
    executedAt: stringOrNull(row.executed_at),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function eventKind(value: unknown): CustomerEventKind {
  const supported: CustomerEventKind[] = [
    "purchase",
    "workorder",
    "email",
    "sms",
    "call",
    "enquiry",
    "note",
    "lifecycle",
    "programme",
    "consent",
    "bike",
    "task",
    "other",
  ];
  return supported.includes(value as CustomerEventKind) ? (value as CustomerEventKind) : "other";
}

function mapEvent(row: Record<string, unknown>): CustomerEvent {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    kind: eventKind(row.event_type),
    title: String(row.title ?? "Customer activity"),
    summary: stringOrNull(row.summary),
    occurredAt: String(row.occurred_at ?? row.created_at ?? ""),
    source: String(row.source_type ?? "crm"),
    sourceId: stringOrNull(row.source_id),
    actorLabel: stringOrNull(row.actor_type),
    channel: channel(row.channel),
    metadata: jsonRecord(row.metadata),
  };
}

function mapWorkorder(row: Record<string, unknown>): CustomerWorkorder {
  const status = String(row.status ?? "unknown");
  const allowedStatuses: CustomerWorkorderStatus[] = [
    "draft",
    "open",
    "booked",
    "checked_in",
    "in_progress",
    "waiting_for_parts",
    "ready",
    "collected",
    "cancelled",
    "unknown",
  ];
  return {
    id: String(row.id),
    customerId: String(row.customer_id ?? ""),
    bikeId: stringOrNull(row.bike_id),
    reference: stringOrNull(row.workorder_number),
    title: String(row.title ?? "Workshop job"),
    status: allowedStatuses.includes(status as CustomerWorkorderStatus)
      ? (status as CustomerWorkorderStatus)
      : "unknown",
    bookedAt: stringOrNull(row.created_at),
    promisedAt: stringOrNull(row.promised_at),
    completedAt: stringOrNull(row.completed_at),
    total: row.total_cents == null ? null : finiteNumber(row.total_cents) / 100,
    summary: stringOrNull(row.description),
    source: "lightspeed",
    sourceId: stringOrNull(row.lightspeed_workorder_id),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function nextCustomerCursor(
  row: Record<string, unknown>,
  sort: CustomerSearchSort,
): KeysetCursor {
  const column =
    sort === "name_asc"
      ? "display_name"
      : sort === "spend_desc"
        ? "total_spend"
        : sort === "last_purchase_desc"
          ? "last_purchase_at"
          : "updated_at";
  const value = row[column];
  return {
    sort,
    id: String(row.id),
    value:
      value == null
        ? null
        : sort === "spend_desc"
          ? finiteNumber(value)
          : String(value),
  };
}

async function searchLegacyCustomers(
  supabase: SupabaseClient,
  ownerUserId: string,
  filters: CustomerSearchFilters,
): Promise<CustomerListResponse> {
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 30)));
  const sort = filters.sort ?? "updated_desc";
  const cursor = decodeKeysetCursor(filters.cursor);
  const sortColumn =
    sort === "name_asc"
      ? "first_name"
      : sort === "spend_desc"
        ? "total_spend"
        : sort === "last_purchase_desc"
          ? "last_purchase_at"
          : "updated_at";
  const ascending = sort === "name_asc";

  let lifecycleContactIds: string[] | null = null;
  if (filters.lifecycleStage && filters.lifecycleStage !== "unknown") {
    const stageResult = await supabase
      .from("crm_lifecycle_states")
      .select("contact_id")
      .eq("user_id", ownerUserId)
      .eq("stage", filters.lifecycleStage);
    if (stageResult.error) {
      throw new CrmRepositoryError(stageResult.error.message, "search_legacy_lifecycle");
    }
    lifecycleContactIds = rows(stageResult.data).map((row) => String(row.contact_id));
    if (lifecycleContactIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: { nextCursor: null, hasMore: false, limit },
      };
    }
  }

  let query = supabase
    .from("crm_contacts")
    .select(
      "id, email, first_name, last_name, phone, lightspeed_customer_id, total_spend, sale_count, last_purchase_at, enriched_at, opted_out, created_at, updated_at",
      { count: "exact" },
    )
    .eq("user_id", ownerUserId)
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("id", { ascending })
    .limit(limit + 1);
  if (lifecycleContactIds) {
    query = query.in("id", lifecycleContactIds);
  }
  const search = cleanSearchQuery(filters.query ?? "");
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},lightspeed_customer_id.ilike.${pattern}`,
    );
  }
  if (filters.specialFilter === "no_email") query = query.is("email", null);
  if (filters.specialFilter === "opted_in") query = query.eq("opted_out", false);
  if (cursor) {
    const value = cursor.value;
    if (value === null && sort === "last_purchase_desc") {
      query = query.or(`and(last_purchase_at.is.null,id.lt.${cursor.id})`);
    } else if (value !== null) {
      const operator = ascending ? "gt" : "lt";
      const idOperator = ascending ? "gt" : "lt";
      const literal = postgrestLiteral(value);
      query = query.or(
        `${sortColumn}.${operator}.${literal},and(${sortColumn}.eq.${literal},id.${idOperator}.${cursor.id})`,
      );
    }
  }
  const result = await query;
  if (result.error) {
    throw new CrmRepositoryError(result.error.message, "search_legacy_customers");
  }
  const legacyRows = rows(result.data);
  const hasMore = legacyRows.length > limit;
  const visibleRows = legacyRows.slice(0, limit);
  const contactIds = visibleRows.map((row) => String(row.id));
  const stageByContactId = new Map<string, CustomerLifecycleStage>();
  if (contactIds.length > 0) {
    const statesResult = await supabase
      .from("crm_lifecycle_states")
      .select("contact_id, stage")
      .eq("user_id", ownerUserId)
      .in("contact_id", contactIds);
    if (statesResult.error) {
      throw new CrmRepositoryError(statesResult.error.message, "search_legacy_lifecycle_lookup");
    }
    for (const row of rows(statesResult.data)) {
      stageByContactId.set(String(row.contact_id), lifecycleStage(row.stage));
    }
  }
  const items = visibleRows.map((row): CustomerSummary => {
    const stage = stageByContactId.get(String(row.id)) ?? "unknown";
    return {
      id: String(row.id),
      displayName:
        [stringOrNull(row.first_name), stringOrNull(row.last_name)].filter(Boolean).join(" ")
        || stringOrNull(row.email)
        || "Unnamed customer",
      firstName: stringOrNull(row.first_name),
      lastName: stringOrNull(row.last_name),
      primaryEmail: stringOrNull(row.email),
      primaryPhone: stringOrNull(row.phone),
      lightspeedCustomerId: stringOrNull(row.lightspeed_customer_id),
      totalSpend: finiteNumber(row.total_spend),
      saleCount: Math.max(0, Math.trunc(finiteNumber(row.sale_count))),
      lastPurchaseAt: stringOrNull(row.last_purchase_at),
      lifecycleStage: stage,
      lifecycleLabel: CUSTOMER_LIFECYCLE_LABELS[stage],
      lastInteractionAt: stringOrNull(row.updated_at),
      dataFreshnessAt: stringOrNull(row.enriched_at),
      bikeCount: 0,
      openTaskCount: 0,
      nextActionAt: null,
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    };
  });
  const last = visibleRows.at(-1);
  const nextValue = last
    ? sort === "name_asc"
      ? stringOrNull(last.first_name) ?? ""
      : sort === "spend_desc"
        ? finiteNumber(last.total_spend)
        : sort === "last_purchase_desc"
          ? stringOrNull(last.last_purchase_at)
          : String(last.updated_at ?? "")
    : null;
  return {
    items,
    total: result.count ?? undefined,
    page: {
      nextCursor:
        hasMore && last
          ? encodeKeysetCursor({ sort, id: String(last.id), value: nextValue })
          : null,
      hasMore,
      limit,
    },
  };
}

export async function searchCustomers(
  supabase: SupabaseClient,
  storeId: string,
  filters: CustomerSearchFilters,
): Promise<CustomerListResponse> {
  const sort = filters.sort ?? "updated_desc";
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 30)));
  const cursor = decodeKeysetCursor(filters.cursor);
  if (filters.cursor && (!cursor || cursor.sort !== sort)) {
    throw new CrmRepositoryError("The customer cursor is invalid for this sort.", "search_customers");
  }

  if (filters.specialFilter || (filters.query && sort === "updated_desc")) {
    if (filters.specialFilter && sort !== "updated_desc") {
      throw new CrmRepositoryError(
        "Opt-in and missing-email filters currently use recent order.",
        "search_customers",
      );
    }
    const rpcResult = await supabase.rpc("crm_search_customers", {
      p_store_id: storeId,
      p_query: cleanSearchQuery(filters.query ?? "") || null,
      p_filter: filters.specialFilter ?? "all",
      p_cursor_updated_at:
        cursor?.value == null ? null : String(cursor.value),
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit + 1,
    });
    if (rpcResult.error && relationUnavailable(rpcResult.error)) {
      return searchLegacyCustomers(supabase, storeId, filters);
    }
    if (rpcResult.error) {
      throw new CrmRepositoryError(rpcResult.error.message, "search_customers");
    }
    const customerRows = rows(rpcResult.data);
    const hasMore = customerRows.length > limit;
    const visibleRows = customerRows.slice(0, limit);
    const last = visibleRows.at(-1);
    return {
      items: visibleRows.map((row) => mapSummary(row)),
      page: {
        nextCursor:
          hasMore && last
            ? encodeKeysetCursor(nextCustomerCursor(last, "updated_desc"))
            : null,
        hasMore,
        limit,
      },
    };
  }

  const sortColumn =
    sort === "name_asc"
      ? "display_name"
      : sort === "spend_desc"
        ? "total_spend"
        : sort === "last_purchase_desc"
          ? "last_purchase_at"
          : "updated_at";
  const ascending = sort === "name_asc";
  let query = supabase
    .from("store_customers")
    .select(CUSTOMER_SELECT)
    .eq("store_id", storeId)
    .eq("status", "active")
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("id", { ascending })
    .limit(limit + 1);

  if (filters.lifecycleStage) query = query.eq("lifecycle_stage", filters.lifecycleStage);
  const search = cleanSearchQuery(filters.query ?? "");
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `display_name.ilike.${pattern},primary_email.ilike.${pattern},primary_phone.ilike.${pattern},lightspeed_customer_id.ilike.${pattern}`,
    );
  }
  if (cursor) {
    const value = cursor.value;
    if (value === null && sort === "last_purchase_desc") {
      query = query.or(`and(last_purchase_at.is.null,id.lt.${cursor.id})`);
    } else if (value !== null) {
      const operator = ascending ? "gt" : "lt";
      const idOperator = ascending ? "gt" : "lt";
      const literal = postgrestLiteral(value);
      query = query.or(
        `${sortColumn}.${operator}.${literal},and(${sortColumn}.eq.${literal},id.${idOperator}.${cursor.id})`,
      );
    }
  }

  const result = await query;
  if (result.error && relationUnavailable(result.error)) {
    return searchLegacyCustomers(supabase, storeId, filters);
  }
  if (result.error) {
    throw new CrmRepositoryError(result.error.message, "search_customers");
  }

  const customerRows = rows(result.data);
  const hasMore = customerRows.length > limit;
  const visibleRows = customerRows.slice(0, limit);
  const customerIds = visibleRows.map((row) => String(row.id));
  const bikeCounts = new Map<string, number>();
  const taskDetails = new Map<string, { count: number; nextAt: string | null }>();

  if (customerIds.length > 0) {
    const [bikeResult, taskResult] = await Promise.all([
      supabase
        .from("store_customer_bikes")
        .select("customer_id")
        .eq("store_id", storeId)
        .in("customer_id", customerIds)
        .limit(1_000),
      supabase
        .from("store_customer_tasks")
        .select("customer_id, due_at")
        .eq("store_id", storeId)
        .in("customer_id", customerIds)
        .in("status", OPEN_TASK_STATUSES)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(1_000),
    ]);
    if (bikeResult.error) {
      throw new CrmRepositoryError(bikeResult.error.message, "load_customer_bike_counts");
    }
    if (taskResult.error) {
      throw new CrmRepositoryError(taskResult.error.message, "load_customer_task_counts");
    }
    for (const row of rows(bikeResult.data)) {
      const customerId = String(row.customer_id);
      bikeCounts.set(customerId, (bikeCounts.get(customerId) ?? 0) + 1);
    }
    for (const row of rows(taskResult.data)) {
      const customerId = String(row.customer_id);
      const current = taskDetails.get(customerId) ?? { count: 0, nextAt: null };
      current.count += 1;
      const dueAt = stringOrNull(row.due_at);
      if (dueAt && (!current.nextAt || dueAt < current.nextAt)) current.nextAt = dueAt;
      taskDetails.set(customerId, current);
    }
  }

  const last = visibleRows.at(-1);
  return {
    items: visibleRows.map((row) => mapSummary(row, bikeCounts, taskDetails)),
    page: {
      hasMore,
      limit,
      nextCursor: hasMore && last ? encodeKeysetCursor(nextCustomerCursor(last, sort)) : null,
    },
  };
}

async function loadLegacyCustomerProfile(
  supabase: SupabaseClient,
  ownerUserId: string,
  contactId: string,
): Promise<CustomerProfile | null> {
  const [contactResult, lifecycleResult] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select(
        "id, email, first_name, last_name, phone, lightspeed_customer_id, total_spend, sale_count, last_purchase_at, enriched_at, opted_out, opted_out_at, opt_out_reason, source, created_at, updated_at",
      )
      .eq("user_id", ownerUserId)
      .eq("id", contactId)
      .maybeSingle(),
    supabase
      .from("crm_lifecycle_states")
      .select("stage, updated_at")
      .eq("user_id", ownerUserId)
      .eq("contact_id", contactId)
      .maybeSingle(),
  ]);
  if (contactResult.error) {
    throw new CrmRepositoryError(contactResult.error.message, "load_legacy_customer");
  }
  if (!contactResult.data) return null;
  const row = contactResult.data as Record<string, unknown>;
  const stage = lifecycleStage(lifecycleResult.data?.stage);
  const email = stringOrNull(row.email);
  const phone = stringOrNull(row.phone);
  const displayName =
    [stringOrNull(row.first_name), stringOrNull(row.last_name)].filter(Boolean).join(" ")
    || email
    || "Unnamed customer";
  return {
    id: String(row.id),
    displayName,
    firstName: stringOrNull(row.first_name),
    lastName: stringOrNull(row.last_name),
    primaryEmail: email,
    primaryPhone: phone,
    lightspeedCustomerId: stringOrNull(row.lightspeed_customer_id),
    totalSpend: finiteNumber(row.total_spend),
    saleCount: Math.max(0, Math.trunc(finiteNumber(row.sale_count))),
    lastPurchaseAt: stringOrNull(row.last_purchase_at),
    lifecycleStage: stage,
    lifecycleLabel: CUSTOMER_LIFECYCLE_LABELS[stage],
    lastInteractionAt: stringOrNull(row.updated_at),
    dataFreshnessAt: stringOrNull(row.enriched_at),
    bikeCount: 0,
    openTaskCount: 0,
    nextActionAt: null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    identities: [
      ...(email
        ? [{
            id: `legacy-email:${row.id}`,
            customerId: String(row.id),
            kind: "email" as const,
            value: email,
            normalisedValue: email.toLowerCase(),
            source: String(row.source ?? "crm"),
            isPrimary: true,
            verifiedAt: null,
            createdAt: String(row.created_at ?? ""),
          }]
        : []),
      ...(phone
        ? [{
            id: `legacy-phone:${row.id}`,
            customerId: String(row.id),
            kind: "phone" as const,
            value: phone,
            normalisedValue: phone.replace(/\D/g, ""),
            source: String(row.source ?? "crm"),
            isPrimary: true,
            verifiedAt: null,
            createdAt: String(row.created_at ?? ""),
          }]
        : []),
    ],
    consents: email
      ? [{
          id: `legacy-email-consent:${row.id}`,
          customerId: String(row.id),
          channel: "email",
          purpose: "marketing",
          status: row.opted_out === true ? "withdrawn" : "unknown",
          source: String(row.opt_out_reason ?? "legacy_crm"),
          legalBasis: null,
          grantedAt: null,
          withdrawnAt: stringOrNull(row.opted_out_at),
          updatedAt: String(row.updated_at ?? ""),
        }]
      : [],
    bikes: [],
    workorders: [],
    openTasks: [],
    pendingActions: [],
  };
}

export async function loadCustomerProfile(
  supabase: SupabaseClient,
  storeId: string,
  customerId: string,
): Promise<CustomerProfile | null> {
  const customerResult = await supabase
    .from("store_customers")
    .select(CUSTOMER_SELECT)
    .eq("store_id", storeId)
    .eq("id", customerId)
    .maybeSingle();
  if (customerResult.error && relationUnavailable(customerResult.error)) {
    return loadLegacyCustomerProfile(supabase, storeId, customerId);
  }
  if (customerResult.error) {
    throw new CrmRepositoryError(customerResult.error.message, "load_customer");
  }
  if (!customerResult.data) return null;

  const [identityResult, consentResult, bikeResult, taskResult, actionResult, workorderResult] =
    await Promise.all([
      supabase
        .from("store_customer_identities")
        .select("*")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("store_customer_consents")
        .select("*")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("store_customer_bikes")
        .select("*")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("store_customer_tasks")
        .select("*")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .in("status", OPEN_TASK_STATUSES)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from("store_agent_actions")
        .select("*")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .in("status", OPEN_ACTION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("store_customer_workorders")
        .select("*")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false })
        .limit(25),
    ]);

  const results = [
    ["load_customer_identities", identityResult],
    ["load_customer_consents", consentResult],
    ["load_customer_bikes", bikeResult],
    ["load_customer_tasks", taskResult],
    ["load_customer_actions", actionResult],
    ["load_customer_workorders", workorderResult],
  ] as const;
  for (const [operation, result] of results) {
    if (result.error) throw new CrmRepositoryError(result.error.message, operation);
  }

  const bikes = rows(bikeResult.data).map(mapBike);
  const openTasks = rows(taskResult.data).map(mapTask);
  const taskDetails = new Map<string, { count: number; nextAt: string | null }>([
    [
      customerId,
      {
        count: openTasks.length,
        nextAt: openTasks.map((task) => task.dueAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
      },
    ],
  ]);
  return {
    ...mapSummary(
      customerResult.data as unknown as Record<string, unknown>,
      new Map([[customerId, bikes.length]]),
      taskDetails,
    ),
    identities: rows(identityResult.data).map(mapIdentity),
    consents: rows(consentResult.data).map(mapConsent),
    bikes,
    workorders: rows(workorderResult.data).map(mapWorkorder),
    openTasks,
    pendingActions: rows(actionResult.data).map(mapAction),
  };
}

function encodeTimelineCursor(cursor: TimelineCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

function decodeTimelineCursor(value: string | null | undefined): TimelineCursor | null {
  if (!value || value.length > 1_024) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<TimelineCursor>;
    return typeof parsed.id === "string" &&
      typeof parsed.occurredAt === "string" &&
      Number.isFinite(Date.parse(parsed.occurredAt))
      ? { id: parsed.id, occurredAt: parsed.occurredAt }
      : null;
  } catch {
    return null;
  }
}

async function loadLegacyCustomerTimeline(
  supabase: SupabaseClient,
  ownerUserId: string,
  contactId: string,
  limit: number,
): Promise<CustomerTimelineResponse> {
  const [campaignResult, lifecycleResult, domestiqueResult] = await Promise.all([
    supabase
      .from("crm_campaign_recipients")
      .select("id, status, sent_at, created_at, campaign:crm_campaigns(subject)")
      .eq("user_id", ownerUserId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("crm_lifecycle_touches")
      .select("id, program_key, stage_at_touch, touched_at, is_holdout")
      .eq("user_id", ownerUserId)
      .eq("contact_id", contactId)
      .order("touched_at", { ascending: false })
      .limit(limit),
    supabase
      .from("domestique_touches")
      .select("id, playbook_key, channel, touched_at, is_holdout")
      .eq("user_id", ownerUserId)
      .eq("contact_id", contactId)
      .order("touched_at", { ascending: false })
      .limit(limit),
  ]);
  const events: CustomerEvent[] = [];
  for (const row of rows(campaignResult.data)) {
    const campaign = record(row.campaign);
    events.push({
      id: `campaign:${String(row.id)}`,
      customerId: contactId,
      kind: "email",
      title: String(campaign.subject ?? "Campaign email"),
      summary: `Campaign ${String(row.status ?? "pending")}`,
      occurredAt: String(row.sent_at ?? row.created_at ?? ""),
      source: "crm_campaign_recipient",
      sourceId: String(row.id),
      actorLabel: "agent",
      channel: "email",
      metadata: {},
    });
  }
  for (const row of rows(lifecycleResult.data)) {
    events.push({
      id: `lifecycle:${String(row.id)}`,
      customerId: contactId,
      kind: "lifecycle",
      title: String(row.program_key ?? "Lifecycle programme"),
      summary: row.is_holdout ? "Held out from contact" : `Contacted while ${String(row.stage_at_touch ?? "unclassified")}`,
      occurredAt: String(row.touched_at ?? ""),
      source: "crm_lifecycle_touch",
      sourceId: String(row.id),
      actorLabel: "agent",
      channel: row.is_holdout ? null : "email",
      metadata: {},
    });
  }
  for (const row of rows(domestiqueResult.data)) {
    events.push({
      id: `domestique:${String(row.id)}`,
      customerId: contactId,
      kind: "programme",
      title: String(row.playbook_key ?? "Domestique play"),
      summary: row.is_holdout ? "Held out from contact" : "Revenue play sent",
      occurredAt: String(row.touched_at ?? ""),
      source: "domestique_touch",
      sourceId: String(row.id),
      actorLabel: "agent",
      channel: row.is_holdout ? null : channel(row.channel),
      metadata: {},
    });
  }
  events.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return {
    items: events.slice(0, limit),
    page: { nextCursor: null, hasMore: false, limit },
  };
}

export async function loadCustomerTimeline(
  supabase: SupabaseClient,
  storeId: string,
  customerId: string,
  options: { limit?: number; cursor?: string | null },
): Promise<CustomerTimelineResponse> {
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 30)));
  const cursor = decodeTimelineCursor(options.cursor);
  if (options.cursor && !cursor) {
    throw new CrmRepositoryError("The timeline cursor is invalid.", "load_customer_timeline");
  }
  let query = supabase
    .from("store_customer_events")
    .select("*")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    query = query.or(
      `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
    );
  }
  const result = await query;
  if (result.error && relationUnavailable(result.error)) {
    return loadLegacyCustomerTimeline(supabase, storeId, customerId, limit);
  }
  if (result.error) {
    throw new CrmRepositoryError(result.error.message, "load_customer_timeline");
  }
  const eventRows = rows(result.data);
  const hasMore = eventRows.length > limit;
  const visible = eventRows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map(mapEvent),
    page: {
      hasMore,
      limit,
      nextCursor:
        hasMore && last
          ? encodeTimelineCursor({
              id: String(last.id),
              occurredAt: String(last.occurred_at),
            })
          : null,
    },
  };
}

export async function customerExists(
  supabase: SupabaseClient,
  storeId: string,
  customerId: string,
): Promise<boolean> {
  const result = await supabase
    .from("store_customers")
    .select("id")
    .eq("store_id", storeId)
    .eq("id", customerId)
    .neq("status", "merged")
    .maybeSingle();
  if (result.error && relationUnavailable(result.error)) {
    const legacy = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("user_id", storeId)
      .eq("id", customerId)
      .maybeSingle();
    if (legacy.error) {
      throw new CrmRepositoryError(legacy.error.message, "check_legacy_customer_exists");
    }
    return Boolean(legacy.data);
  }
  if (result.error) {
    throw new CrmRepositoryError(result.error.message, "check_customer_exists");
  }
  return Boolean(result.data);
}

function customerNameMap(customerRows: Array<Record<string, unknown>>): Map<string, string> {
  return new Map(
    customerRows.map((row) => [
      String(row.id),
      String(row.display_name ?? row.primary_email ?? "Unnamed customer"),
    ]),
  );
}

function toTodayItem(
  input: Omit<TodayItem, "customerName">,
  names: Map<string, string>,
): TodayItem {
  return {
    ...input,
    customerName: input.customerId ? (names.get(input.customerId) ?? "Unnamed customer") : null,
  };
}

function groupForItem(item: TodayItem, now: Date): TodayGroupKey {
  if (item.source === "enquiry") return "enquiries";
  if (item.status === "awaiting_approval" || item.status === "proposed") return "awaiting_approval";
  if (!item.dueAt) return "upcoming";
  const due = Date.parse(item.dueAt);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS);
  if (due < start.getTime()) return "overdue";
  if (due < end.getTime()) return "due_today";
  return "upcoming";
}

function pendingSnoozeUntil(value: unknown): string | null {
  const prefix = "CRM snoozed until ";
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const timestamp = value.slice(prefix.length);
  return Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null;
}

export async function loadTodayQueue(
  supabase: SupabaseClient,
  storeId: string,
  ownerUserId: string,
  now = new Date(),
): Promise<TodayQueue> {
  const horizon = new Date(now.getTime() + 7 * DAY_MS).toISOString();
  const nowIso = now.toISOString();
  const [taskResult, actionResult, lifecycleResult, domestiqueResult, enquiryResult] =
    await Promise.all([
      supabase
        .from("store_customer_tasks")
        .select("*")
        .eq("store_id", storeId)
        .in("status", OPEN_TASK_STATUSES)
        .or(`due_at.is.null,due_at.lte.${horizon}`)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from("store_agent_actions")
        .select("*")
        .eq("store_id", storeId)
        .in("status", OPEN_ACTION_STATUSES)
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("crm_lifecycle_actions")
        .select("id, program_key, subject, reasoning, status, status_detail, created_at, expires_at")
        .eq("user_id", ownerUserId)
        .eq("status", "awaiting_approval")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("domestique_opportunities")
        .select("id, playbook_key, title, summary, status, status_detail, action_plan, created_at, expires_at")
        .eq("user_id", ownerUserId)
        .eq("status", "proposed")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("store_customer_inquiries")
        .select("id, sender_name, sender_email, subject, snippet, priority, status, received_at, created_at")
        .eq("user_id", ownerUserId)
        .in("status", OPEN_INQUIRY_STATUSES)
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(50),
    ]);

  const results = [
    ["load_today_tasks", taskResult],
    ["load_today_actions", actionResult],
    ["load_today_lifecycle", lifecycleResult],
    ["load_today_domestique", domestiqueResult],
    ["load_today_enquiries", enquiryResult],
  ] as const;
  for (const [operation, result] of results) {
    if (result.error && relationUnavailable(result.error)) continue;
    if (result.error) throw new CrmRepositoryError(result.error.message, operation);
  }

  const customerIds = new Set<string>();
  for (const row of [...rows(taskResult.data), ...rows(actionResult.data), ...rows(enquiryResult.data)]) {
    const customerId = stringOrNull(row.customer_id);
    if (customerId) customerIds.add(customerId);
  }
  let names = new Map<string, string>();
  if (customerIds.size > 0) {
    const customerResult = await supabase
      .from("store_customers")
      .select("id, display_name, primary_email")
      .eq("store_id", storeId)
      .in("id", [...customerIds])
      .limit(300);
    if (customerResult.error) {
      throw new CrmRepositoryError(customerResult.error.message, "load_today_customer_names");
    }
    names = customerNameMap(rows(customerResult.data));
  }

  const items: TodayItem[] = [];
  for (const row of rows(taskResult.data)) {
    const task = mapTask(row);
    if (task.status === "snoozed" && task.snoozedUntil && task.snoozedUntil > nowIso) continue;
    items.push(
      toTodayItem(
        {
          id: `task:${task.id}`,
          source: "task",
          sourceId: task.id,
          customerId: task.customerId,
          title: task.title,
          summary: task.summary,
          priority: task.priority,
          status: task.status,
          riskTier: "low",
          dueAt: task.dueAt,
          createdAt: task.createdAt,
          availableDecisions: ["approve", "dismiss", "snooze"],
        },
        names,
      ),
    );
  }
  for (const row of rows(actionResult.data)) {
    const action = mapAction(row);
    if (action.status === "snoozed" && action.snoozedUntil && action.snoozedUntil > nowIso) continue;
    items.push(
      toTodayItem(
        {
          id: `agent:${action.id}`,
          source: "agent",
          sourceId: action.id,
          customerId: action.customerId,
          title: action.title,
          summary: action.summary,
          priority: taskPriority(row.priority),
          status: action.status,
          riskTier: action.riskTier,
          dueAt: action.dueAt,
          createdAt: action.createdAt,
          proposal: action.proposal,
          decisionReason: action.decisionReason,
          availableDecisions: ["approve", "dismiss", "snooze"],
        },
        names,
      ),
    );
  }
  for (const row of rows(lifecycleResult.data)) {
    const snoozedUntil = pendingSnoozeUntil(row.status_detail);
    if (snoozedUntil && snoozedUntil > nowIso) continue;
    items.push(
      toTodayItem(
        {
          id: `lifecycle:${String(row.id)}`,
          source: "lifecycle",
          sourceId: String(row.id),
          customerId: null,
          title: String(row.subject ?? row.program_key ?? "Lifecycle message"),
          summary: stringOrNull(row.reasoning),
          priority: "normal",
          status: "awaiting_approval",
          riskTier: "approval",
          dueAt: stringOrNull(row.expires_at),
          createdAt: String(row.created_at ?? ""),
          availableDecisions: ["approve", "dismiss", "snooze"],
        },
        names,
      ),
    );
  }
  for (const row of rows(domestiqueResult.data)) {
    const snoozedUntil = pendingSnoozeUntil(row.status_detail);
    if (snoozedUntil && snoozedUntil > nowIso) continue;
    const actionPlan = record(row.action_plan);
    const isFinancial = Array.isArray(actionPlan.discounts) && actionPlan.discounts.length > 0;
    items.push(
      toTodayItem(
        {
          id: `domestique:${String(row.id)}`,
          source: "domestique",
          sourceId: String(row.id),
          customerId: null,
          title: String(row.title ?? row.playbook_key ?? "Domestique play"),
          summary: stringOrNull(row.summary),
          priority: isFinancial ? "high" : "normal",
          status: "proposed",
          riskTier: isFinancial ? "restricted" : "approval",
          dueAt: stringOrNull(row.expires_at),
          createdAt: String(row.created_at ?? ""),
          availableDecisions: ["approve", "dismiss", "snooze"],
        },
        names,
      ),
    );
  }
  for (const row of rows(enquiryResult.data)) {
    const sender = String(row.sender_name ?? row.sender_email ?? "Customer");
    items.push(
      toTodayItem(
        {
          id: `enquiry:${String(row.id)}`,
          source: "enquiry",
          sourceId: String(row.id),
          customerId: stringOrNull(row.customer_id),
          title: String(row.subject ?? `Enquiry from ${sender}`),
          summary: stringOrNull(row.snippet),
          priority: taskPriority(row.priority),
          status: "open",
          riskTier: "approval",
          dueAt: stringOrNull(row.received_at),
          createdAt: String(row.created_at ?? row.received_at ?? ""),
          availableDecisions: [],
        },
        names,
      ),
    );
  }

  const ordered = rankTodayItems(items, now);
  const groupOrder: TodayGroupKey[] = [
    "overdue",
    "due_today",
    "awaiting_approval",
    "enquiries",
    "upcoming",
  ];
  const groups: TodayGroup[] = groupOrder.map((key) => {
    const groupItems = ordered.filter((item) => groupForItem(item, now) === key);
    return { key, label: TODAY_GROUP_LABELS[key], count: groupItems.length, items: groupItems };
  });
  return {
    generatedAt: nowIso,
    groups,
    totalCount: items.length,
  };
}

function channelLabel(value: unknown): string {
  const raw = String(value ?? "").replaceAll("_", " ");
  return raw ? raw.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Internal";
}

export async function loadAutomationSummaries(
  supabase: SupabaseClient,
  storeId: string,
  ownerUserId: string,
): Promise<AutomationSummaryResponse> {
  const [
    programmeResult,
    lifecycleActionResult,
    lifecycleTouchResult,
    domestiqueConfigResult,
    opportunityResult,
    domestiqueTouchResult,
    domestiqueRunResult,
    agentActionResult,
  ] =
    await Promise.all([
      supabase
        .from("crm_lifecycle_programs")
        .select("id, key, name, description, enabled, mode, last_run_at")
        .eq("user_id", ownerUserId)
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("crm_lifecycle_actions")
        .select("id, program_key, subject, reasoning, status, status_detail, expires_at, executed_at, created_at")
        .eq("user_id", ownerUserId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("crm_lifecycle_touches")
        .select("program_key, attributed_revenue")
        .eq("user_id", ownerUserId)
        .eq("is_holdout", false)
        .order("touched_at", { ascending: false })
        .limit(1_000),
      supabase
        .from("domestique_config")
        .select("is_enabled, mode, enabled_playbooks, last_run_at")
        .eq("user_id", ownerUserId)
        .maybeSingle(),
      supabase
        .from("domestique_opportunities")
        .select("id, playbook_key, title, summary, action_plan, status, status_detail, result, expected_value, expires_at, created_at, executed_at")
        .eq("user_id", ownerUserId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("domestique_touches")
        .select("playbook_key, attributed_revenue")
        .eq("user_id", ownerUserId)
        .eq("is_holdout", false)
        .order("touched_at", { ascending: false })
        .limit(1_000),
      supabase
        .from("domestique_runs")
        .select("id, status, trigger, opportunities_proposed, auto_executed, error, summary, started_at, finished_at")
        .eq("user_id", ownerUserId)
        .order("started_at", { ascending: false })
        .limit(25),
      supabase
        .from("store_agent_actions")
        .select("id, customer_id, programme_key, action_type, channel, risk_tier, status, title, reasoning, proposed_payload, policy_decision, expires_at, snoozed_until, executed_at, created_at, updated_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
  const results = [
    ["load_automation_lifecycle_programmes", programmeResult],
    ["load_automation_lifecycle_actions", lifecycleActionResult],
    ["load_automation_lifecycle_touches", lifecycleTouchResult],
    ["load_automation_domestique_config", domestiqueConfigResult],
    ["load_automation_domestique_opportunities", opportunityResult],
    ["load_automation_domestique_touches", domestiqueTouchResult],
    ["load_automation_domestique_runs", domestiqueRunResult],
    ["load_automation_agent_actions", agentActionResult],
  ] as const;
  for (const [operation, result] of results) {
    if (result.error && relationUnavailable(result.error)) continue;
    if (result.error) throw new CrmRepositoryError(result.error.message, operation);
  }

  const lifecycleCounts = new Map<string, { pending: number; completed: number }>();
  for (const row of rows(lifecycleActionResult.data)) {
    const key = String(row.program_key);
    const counts = lifecycleCounts.get(key) ?? { pending: 0, completed: 0 };
    if (["awaiting_approval", "approved", "executing"].includes(String(row.status))) counts.pending += 1;
    if (row.status === "sent") counts.completed += 1;
    lifecycleCounts.set(key, counts);
  }
  const lifecycleRevenue = new Map<string, number>();
  for (const row of rows(lifecycleTouchResult.data)) {
    const key = String(row.program_key);
    lifecycleRevenue.set(
      key,
      (lifecycleRevenue.get(key) ?? 0) + finiteNumber(row.attributed_revenue),
    );
  }

  const automations: AutomationSummary[] = rows(programmeResult.data).map((row) => {
    const key = String(row.key);
    const counts = lifecycleCounts.get(key) ?? { pending: 0, completed: 0 };
    return {
      id: `lifecycle:${String(row.id)}`,
      source: "lifecycle",
      key,
      name: String(row.name ?? key),
      description: String(row.description ?? ""),
      state: booleanValue(row.enabled) ? (row.mode === "auto" ? "active" : "review") : "paused",
      channelLabel: "Email",
      riskTier: "approval",
      lastRunAt: stringOrNull(row.last_run_at),
      pendingCount: counts.pending,
      completedCount: counts.completed,
      attributedRevenue: lifecycleRevenue.get(key) ?? 0,
      mechanics: [],
    };
  });

  const config = record(domestiqueConfigResult.data);
  const enabledPlaybooks = new Set(
    Array.isArray(config.enabled_playbooks) ? config.enabled_playbooks.map(String) : [],
  );
  const opportunityByPlaybook = new Map<
    string,
    {
      latest: Record<string, unknown>;
      pending: number;
      completed: number;
      attributedRevenue: number;
    }
  >();
  for (const row of rows(opportunityResult.data)) {
    const key = String(row.playbook_key);
    const current = opportunityByPlaybook.get(key) ?? {
      latest: row,
      pending: 0,
      completed: 0,
      attributedRevenue: 0,
    };
    if (row.status === "proposed" || row.status === "executing") current.pending += 1;
    if (row.status === "executed") current.completed += 1;
    opportunityByPlaybook.set(key, current);
  }
  for (const row of rows(domestiqueTouchResult.data)) {
    const key = String(row.playbook_key);
    const current = opportunityByPlaybook.get(key);
    if (current) current.attributedRevenue += finiteNumber(row.attributed_revenue);
  }
  for (const [key, summary] of opportunityByPlaybook) {
    const actionPlan = record(summary.latest.action_plan);
    automations.push({
      id: `domestique:${key}`,
      source: "domestique",
      key,
      name: String(summary.latest.title ?? channelLabel(key)),
      description: String(summary.latest.summary ?? ""),
      state:
        booleanValue(config.is_enabled) && enabledPlaybooks.has(key)
          ? config.mode === "suggest"
            ? "review"
            : "active"
          : "paused",
      channelLabel: channelLabel(actionPlan.channel),
      riskTier:
        Array.isArray(actionPlan.discounts) && actionPlan.discounts.length > 0
          ? "restricted"
          : "approval",
      lastRunAt:
        stringOrNull(summary.latest.executed_at) ??
        stringOrNull(config.last_run_at) ??
        stringOrNull(summary.latest.created_at),
      pendingCount: summary.pending,
      completedCount: summary.completed,
      attributedRevenue: summary.attributedRevenue,
      mechanics: [],
    });
  }

  const agentActionsByProgramme = new Map<
    string,
    { pending: number; completed: number; lastRunAt: string | null }
  >();
  for (const row of rows(agentActionResult.data)) {
    const key = String(row.programme_key ?? "");
    if (!key) continue;
    const current = agentActionsByProgramme.get(key) ?? {
      pending: 0,
      completed: 0,
      lastRunAt: null,
    };
    if (["draft", "awaiting_approval", "approved", "executing", "snoozed"].includes(String(row.status))) {
      current.pending += 1;
    }
    if (row.status === "completed") current.completed += 1;
    const timestamp = stringOrNull(row.executed_at) ?? stringOrNull(row.created_at);
    if (timestamp && (!current.lastRunAt || timestamp > current.lastRunAt)) current.lastRunAt = timestamp;
    agentActionsByProgramme.set(key, current);
  }

  for (const programme of BIKE_PROGRAMMES) {
    const actionCounts = agentActionsByProgramme.get(programme.key);
    automations.push({
      id: `programme_registry:${programme.key}`,
      source: "programme_registry",
      key: programme.key,
      name: programme.name,
      description: programme.description,
      state: actionCounts
        ? actionCounts.pending > 0
          ? "review"
          : "active"
        : programme.defaultEnabled
          ? "active"
          : "paused",
      channelLabel: programme.channels.map(channelLabel).join(" + "),
      riskTier: programme.riskTier,
      lastRunAt: actionCounts?.lastRunAt ?? null,
      pendingCount: actionCounts?.pending ?? 0,
      completedCount: actionCounts?.completed ?? 0,
      attributedRevenue: 0,
      mechanics: [...programme.mechanics],
    });
  }

  const nowIso = new Date().toISOString();
  const approvals: Array<TodayItem | AgentAction> = [];
  for (const row of rows(lifecycleActionResult.data)) {
    if (row.status !== "awaiting_approval") continue;
    const snoozedUntil = pendingSnoozeUntil(row.status_detail);
    if (snoozedUntil && snoozedUntil > nowIso) continue;
    approvals.push({
      id: `lifecycle:${String(row.id)}`,
      source: "lifecycle",
      sourceId: String(row.id),
      customerId: null,
      customerName: null,
      title: String(row.subject ?? row.program_key ?? "Lifecycle message"),
      summary: stringOrNull(row.reasoning),
      priority: "normal",
      status: "awaiting_approval",
      riskTier: "approval",
      dueAt: stringOrNull(row.expires_at),
      createdAt: String(row.created_at ?? ""),
      availableDecisions: ["approve", "dismiss", "snooze"],
    });
  }
  for (const row of rows(opportunityResult.data)) {
    if (row.status !== "proposed") continue;
    const snoozedUntil = pendingSnoozeUntil(row.status_detail);
    if (snoozedUntil && snoozedUntil > nowIso) continue;
    const actionPlan = record(row.action_plan);
    const financial = Array.isArray(actionPlan.discounts) && actionPlan.discounts.length > 0;
    approvals.push({
      id: `domestique:${String(row.id)}`,
      source: "domestique",
      sourceId: String(row.id),
      customerId: null,
      customerName: null,
      title: String(row.title ?? row.playbook_key ?? "Domestique play"),
      summary: stringOrNull(row.summary),
      priority: financial ? "high" : "normal",
      status: "proposed",
      riskTier: financial ? "restricted" : "approval",
      dueAt: stringOrNull(row.expires_at),
      createdAt: String(row.created_at ?? ""),
      availableDecisions: ["approve", "dismiss", "snooze"],
    });
  }
  for (const row of rows(agentActionResult.data)) {
    if (!["draft", "awaiting_approval", "approved", "snoozed"].includes(String(row.status))) {
      continue;
    }
    const snoozedUntil = stringOrNull(row.snoozed_until);
    if (snoozedUntil && snoozedUntil > nowIso) continue;
    const mapped = mapAction(row);
    approvals.push({
      ...mapped,
      id: `agent:${mapped.id}`,
    });
  }

  const runs: AutomationRunSummary[] = rows(domestiqueRunResult.data).map((row) => ({
    id: `domestique:${String(row.id)}`,
    name: "Domestique run",
    automationName: "Domestique",
    status: String(row.status ?? "completed"),
    startedAt: stringOrNull(row.started_at),
    completedAt: stringOrNull(row.finished_at),
    summary:
      stringOrNull(row.error) ??
      `${Math.max(0, Math.trunc(finiteNumber(row.opportunities_proposed)))} proposed · ${Math.max(0, Math.trunc(finiteNumber(row.auto_executed)))} completed`,
  }));
  for (const row of rows(lifecycleActionResult.data)) {
    if (!["sent", "failed", "expired"].includes(String(row.status))) continue;
    runs.push({
      id: `lifecycle:${String(row.id)}`,
      name: String(row.subject ?? row.program_key ?? "Lifecycle action"),
      automationName: String(row.program_key ?? "Lifecycle"),
      status: String(row.status),
      startedAt: stringOrNull(row.created_at),
      completedAt: stringOrNull(row.executed_at),
      summary: stringOrNull(row.reasoning),
    });
  }
  for (const row of rows(agentActionResult.data)) {
    if (!["completed", "failed", "expired"].includes(String(row.status))) continue;
    runs.push({
      id: `agent:${String(row.id)}`,
      name: String(row.title ?? row.programme_key ?? "Agent action"),
      automationName: String(row.programme_key ?? row.action_type ?? "Bike programme"),
      status: String(row.status),
      startedAt: stringOrNull(row.created_at),
      completedAt: stringOrNull(row.executed_at) ?? stringOrNull(row.updated_at),
      summary: stringOrNull(row.reasoning),
    });
  }
  runs.sort((left, right) =>
    String(right.startedAt ?? "").localeCompare(String(left.startedAt ?? "")),
  );

  return {
    generatedAt: nowIso,
    automations,
    approvals: [
      ...rankTodayItems(approvals.filter((item): item is TodayItem => "availableDecisions" in item)),
      ...approvals.filter((item): item is AgentAction => !("availableDecisions" in item)),
    ].slice(0, 100),
    runs: runs.slice(0, 50),
  };
}

export function parseActionReference(
  id: string,
  sourceHint?: AgentActionSource,
): { source: AgentActionSource; sourceId: string } | null {
  const separator = id.indexOf(":");
  if (separator > 0) {
    const source = id.slice(0, separator);
    const sourceId = id.slice(separator + 1);
    if (
      ["agent", "task", "lifecycle", "domestique", "enquiry"].includes(source) &&
      sourceId
    ) {
      return { source: source as AgentActionSource, sourceId };
    }
  }
  return sourceHint && id ? { source: sourceHint, sourceId: id } : null;
}
