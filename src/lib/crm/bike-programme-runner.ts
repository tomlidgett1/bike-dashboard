import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

type CandidateCustomer = {
  id: string;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  lifecycle_stage: string | null;
};

type ProposedAction = {
  store_id: string;
  customer_id: string;
  agent_key: string;
  programme_key: string;
  dedupe_key: string;
  action_type: string;
  channel: "email" | "sms";
  risk_tier: "approval";
  status: "awaiting_approval";
  title: string;
  reasoning: string;
  supporting_records: Array<Record<string, unknown>>;
  proposed_payload: Record<string, unknown>;
  expected_value: number | null;
  confidence: number;
  policy_decision: Record<string, unknown>;
  agent_version: string;
  expires_at: string;
};

const VERSION = "bike-programmes-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function bikeLabel(bike: { brand?: unknown; model?: unknown }): string {
  return [bike.brand, bike.model].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ")
    || "bike";
}

function consentKey(customerId: string, channel: string, purpose: string): string {
  return `${customerId}:${channel}:${purpose}`;
}

async function storeForOwner(admin: AdminClient, userId: string): Promise<{ id: string }> {
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("crm_enabled", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load CRM store: ${error.message}`);
  if (!data) throw new Error("CRM is not enabled for this store.");
  return { id: String(data.id) };
}

async function customerMap(
  admin: AdminClient,
  storeId: string,
  customerIds: string[],
): Promise<Map<string, CandidateCustomer>> {
  const map = new Map<string, CandidateCustomer>();
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data, error } = await admin
    .from("store_customers")
    .select("id, display_name, primary_email, primary_phone, lifecycle_stage")
    .eq("store_id", storeId)
    .eq("status", "active")
    .in("id", ids);
  if (error) throw new Error(`Could not load programme customers: ${error.message}`);
  for (const row of data ?? []) map.set(String(row.id), row as CandidateCustomer);
  return map;
}

async function consentMap(
  admin: AdminClient,
  storeId: string,
  customerIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data, error } = await admin
    .from("store_customer_consents")
    .select("customer_id, channel, purpose, status")
    .eq("store_id", storeId)
    .in("customer_id", ids);
  if (error) throw new Error(`Could not load programme consent: ${error.message}`);
  for (const row of data ?? []) {
    map.set(
      consentKey(String(row.customer_id), String(row.channel), String(row.purpose)),
      String(row.status),
    );
  }
  return map;
}

function hasConsent(
  consents: Map<string, string>,
  customerId: string,
  channel: "email" | "sms",
  purpose: "marketing" | "service" | "community" | "transactional",
  allowUnknownOperational = false,
): boolean {
  const status = consents.get(consentKey(customerId, channel, purpose));
  if (status === "granted") return true;
  return allowUnknownOperational && status !== "denied" && status !== "withdrawn";
}

function preferredChannel(
  customer: CandidateCustomer,
  consents: Map<string, string>,
  purpose: "marketing" | "service" | "community" | "transactional",
  allowUnknownOperational = false,
): "sms" | "email" | null {
  if (
    customer.primary_phone
    && hasConsent(consents, customer.id, "sms", purpose, allowUnknownOperational)
  ) return "sms";
  if (
    customer.primary_email
    && hasConsent(consents, customer.id, "email", purpose, allowUnknownOperational)
  ) return "email";
  return null;
}

function policyDecision(args: {
  purpose: "marketing" | "service" | "community" | "transactional";
  channel: "email" | "sms";
  operational: boolean;
}): Record<string, unknown> {
  return {
    classifier: "deterministic",
    risk_tier: "approval",
    external_communication: true,
    consent_purpose: args.purpose,
    channel: args.channel,
    operational: args.operational,
    rationale: "Customer-facing communication requires approval during progressive-autonomy rollout.",
  };
}

async function loadCandidates(admin: AdminClient, storeId: string) {
  const now = new Date().toISOString();
  const inTwoWeeks = isoDaysFromNow(14);
  const inThirtyDays = isoDaysFromNow(30);
  const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS).toISOString();

  const [bikes, workorders, atRisk, events] = await Promise.all([
    admin
      .from("store_customer_bikes")
      .select("id, customer_id, brand, model, is_ebike, warranty_expires_at, last_service_at, next_service_due_at")
      .eq("store_id", storeId)
      .or(`next_service_due_at.lte.${inTwoWeeks},warranty_expires_at.lte.${inThirtyDays}`)
      .order("next_service_due_at", { ascending: true, nullsFirst: false })
      .limit(200),
    admin
      .from("store_customer_workorders")
      .select("id, customer_id, workorder_number, status, status_label, title, promised_at, completed_at, updated_at")
      .eq("store_id", storeId)
      .not("customer_id", "is", null)
      .in("status", ["ready", "waiting_for_parts", "completed"])
      .gte("updated_at", threeDaysAgo)
      .order("updated_at", { ascending: false })
      .limit(200),
    admin
      .from("store_customers")
      .select("id, display_name, primary_email, primary_phone, lifecycle_stage")
      .eq("store_id", storeId)
      .eq("status", "active")
      .in("lifecycle_stage", ["vip", "at_risk"])
      .order("total_spend", { ascending: false })
      .limit(100),
    admin
      .from("store_community_events")
      .select("id, title, event_type, starts_at")
      .eq("store_id", storeId)
      .eq("status", "published")
      .gte("starts_at", now)
      .lte("starts_at", isoDaysFromNow(7))
      .order("starts_at", { ascending: true })
      .limit(20),
  ]);
  const error = [bikes.error, workorders.error, atRisk.error, events.error].find(Boolean);
  if (error) throw new Error(`Could not load bike programme candidates: ${error.message}`);
  return {
    bikes: bikes.data ?? [],
    workorders: workorders.data ?? [],
    atRisk: atRisk.data ?? [],
    events: events.data ?? [],
  };
}

export async function runBikeStoreProgrammesForUser(args: {
  userId: string;
  admin?: SupabaseClient;
}): Promise<{ proposed: number; skippedForConsent: number }> {
  const admin = (args.admin as AdminClient | undefined) ?? createServiceRoleClient();
  const store = await storeForOwner(admin, args.userId);
  const candidates = await loadCandidates(admin, store.id);
  const customerIds = [
    ...candidates.bikes.map((row) => String(row.customer_id ?? "")),
    ...candidates.workorders.map((row) => String(row.customer_id ?? "")),
    ...candidates.atRisk.map((row) => String(row.id)),
  ].filter(Boolean);
  const [customers, consents] = await Promise.all([
    customerMap(admin, store.id, customerIds),
    consentMap(admin, store.id, customerIds),
  ]);

  const actions: ProposedAction[] = [];
  let skippedForConsent = 0;

  for (const workorder of candidates.workorders) {
    const customer = customers.get(String(workorder.customer_id));
    if (!customer) continue;
    const status = String(workorder.status);
    const purpose = status === "completed" ? "marketing" as const : "transactional" as const;
    const channel = preferredChannel(
      customer,
      consents,
      purpose,
      status !== "completed",
    );
    if (!channel) {
      skippedForConsent += 1;
      continue;
    }
    const programmeKey = status === "completed" ? "review_referral" : "workorder_milestones";
    const statusSentence = status === "ready"
      ? "their bike is ready for collection"
      : status === "waiting_for_parts"
        ? "their workshop job is waiting for parts"
        : "their recent service is complete";
    actions.push({
      store_id: store.id,
      customer_id: customer.id,
      agent_key: "workshop-care",
      programme_key: programmeKey,
      dedupe_key: `${programmeKey}:${status}:${workorder.id}:${String(workorder.updated_at).slice(0, 10)}`,
      action_type: status === "completed" ? "request_review" : "send_workorder_update",
      channel,
      risk_tier: "approval",
      status: "awaiting_approval",
      title: `${customer.display_name}: ${String(workorder.status_label || status).replaceAll("_", " ")}`,
      reasoning: `Lightspeed shows ${statusSentence}. A proactive update prevents uncertainty and status calls.`,
      supporting_records: [{
        type: "workorder",
        id: workorder.id,
        number: workorder.workorder_number,
        status,
        promised_at: workorder.promised_at,
      }],
      proposed_payload: {
        recipient: channel === "sms" ? customer.primary_phone : customer.primary_email,
        message: status === "ready"
          ? `Hi ${customer.display_name.split(" ")[0]}, your bike is ready to collect. Reply here if you need anything before pickup.`
          : status === "waiting_for_parts"
            ? `Hi ${customer.display_name.split(" ")[0]}, a quick workshop update: we're waiting on parts for your bike and will keep you posted.`
          : `Hi ${customer.display_name.split(" ")[0]}, how is your bike feeling after its service? If everything is running well, we'd appreciate an honest review. If anything needs a quick adjustment, please let us know instead.`,
        workorder_id: workorder.id,
      },
      expected_value: null,
      confidence: 0.98,
      policy_decision: policyDecision({
        purpose,
        channel,
        operational: status !== "completed",
      }),
      agent_version: VERSION,
      expires_at: isoDaysFromNow(status === "ready" ? 2 : 7),
    });
  }

  for (const bike of candidates.bikes) {
    const customer = customers.get(String(bike.customer_id));
    if (!customer) continue;
    const serviceDue = bike.next_service_due_at && Date.parse(String(bike.next_service_due_at)) <= Date.parse(isoDaysFromNow(14));
    const warrantyDue = bike.is_ebike && bike.warranty_expires_at
      && Date.parse(String(bike.warranty_expires_at)) <= Date.parse(isoDaysFromNow(30));
    if (!serviceDue && !warrantyDue) continue;
    const purpose = "service" as const;
    const channel = preferredChannel(customer, consents, purpose);
    if (!channel) {
      skippedForConsent += 1;
      continue;
    }
    const programmeKey = warrantyDue ? "ebike_safety_warranty" : "annual_service";
    const label = bikeLabel(bike);
    actions.push({
      store_id: store.id,
      customer_id: customer.id,
      agent_key: "rider-lifecycle",
      programme_key: programmeKey,
      dedupe_key: `${programmeKey}:${bike.id}:${new Date().toISOString().slice(0, 7)}`,
      action_type: warrantyDue ? "send_ebike_warranty_reminder" : "send_service_reminder",
      channel,
      risk_tier: "approval",
      status: "awaiting_approval",
      title: warrantyDue ? `${customer.display_name}'s e-bike warranty` : `${customer.display_name}'s ${label} is due for service`,
      reasoning: warrantyDue
        ? `The recorded warranty for ${label} expires within 30 days.`
        : `The service schedule for ${label} is due within 14 days.`,
      supporting_records: [{
        type: "bike",
        id: bike.id,
        label,
        next_service_due_at: bike.next_service_due_at,
        warranty_expires_at: bike.warranty_expires_at,
      }],
      proposed_payload: {
        recipient: channel === "sms" ? customer.primary_phone : customer.primary_email,
        message: warrantyDue
          ? `Hi ${customer.display_name.split(" ")[0]}, your ${label} warranty is coming up for review. We can help check the bike and your warranty details.`
          : `Hi ${customer.display_name.split(" ")[0]}, your ${label} is coming up for its scheduled service. Would you like us to help book a time?`,
        bike_id: bike.id,
      },
      expected_value: null,
      confidence: 0.94,
      policy_decision: policyDecision({ purpose, channel, operational: false }),
      agent_version: VERSION,
      expires_at: isoDaysFromNow(14),
    });
  }

  for (const candidate of candidates.atRisk) {
    const customer = customers.get(String(candidate.id)) ?? candidate as CandidateCustomer;
    const channel = preferredChannel(customer, consents, "marketing");
    if (!channel) {
      skippedForConsent += 1;
      continue;
    }
    const programmeKey = customer.lifecycle_stage === "vip" ? "vip_care" : "at_risk_rider";
    actions.push({
      store_id: store.id,
      customer_id: customer.id,
      agent_key: "rider-lifecycle",
      programme_key: programmeKey,
      dedupe_key: `${programmeKey}:${customer.id}:${new Date().toISOString().slice(0, 7)}`,
      action_type: "send_relationship_check_in",
      channel,
      risk_tier: "approval",
      status: "awaiting_approval",
      title: `Check in with ${customer.display_name}`,
      reasoning: customer.lifecycle_stage === "vip"
        ? "A high-value rider has not heard from the store recently."
        : "Lifecycle signals suggest this rider relationship is cooling.",
      supporting_records: [{ type: "lifecycle_stage", stage: customer.lifecycle_stage }],
      proposed_payload: {
        recipient: channel === "sms" ? customer.primary_phone : customer.primary_email,
        message: `Hi ${customer.display_name.split(" ")[0]}, how has the riding been? If there's anything we can help with — service, setup or a local ride — just let us know.`,
      },
      expected_value: null,
      confidence: 0.8,
      policy_decision: policyDecision({ purpose: "marketing", channel, operational: false }),
      agent_version: VERSION,
      expires_at: isoDaysFromNow(7),
    });
  }

  // Community invitations deliberately target only customers already present
  // in this bounded candidate set and explicitly opted into community updates.
  for (const event of candidates.events) {
    for (const customer of customers.values()) {
      const channel = preferredChannel(customer, consents, "community");
      if (!channel) continue;
      actions.push({
        store_id: store.id,
        customer_id: customer.id,
        agent_key: "community",
        programme_key: "group_ride_clinic",
        dedupe_key: `group_ride_clinic:${event.id}:${customer.id}`,
        action_type: "send_community_invitation",
        channel,
        risk_tier: "approval",
        status: "awaiting_approval",
        title: `Invite ${customer.display_name} to ${String(event.title)}`,
        reasoning: "This rider opted into community invitations and the event is within seven days.",
        supporting_records: [{ type: "community_event", id: event.id, starts_at: event.starts_at }],
        proposed_payload: {
          recipient: channel === "sms" ? customer.primary_phone : customer.primary_email,
          message: `Hi ${customer.display_name.split(" ")[0]}, we're hosting ${String(event.title)} on ${new Date(String(event.starts_at)).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}. We'd love to see you there.`,
          community_event_id: event.id,
        },
        expected_value: null,
        confidence: 0.9,
        policy_decision: policyDecision({ purpose: "community", channel, operational: false }),
        agent_version: VERSION,
        expires_at: String(event.starts_at),
      });
    }
  }

  for (let index = 0; index < actions.length; index += 200) {
    const { error } = await admin
      .from("store_agent_actions")
      .upsert(actions.slice(index, index + 200), {
        onConflict: "store_id,dedupe_key",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Could not create bike-programme proposals: ${error.message}`);
  }

  return { proposed: actions.length, skippedForConsent };
}

export async function runBikeStoreProgrammesForEnabledStores(args?: {
  admin?: SupabaseClient;
  maxStores?: number;
}): Promise<{
  checked: number;
  succeeded: number;
  failed: number;
  results: Array<{ userId: string; success: boolean; proposed?: number; skippedForConsent?: number; error?: string }>;
}> {
  const admin = (args?.admin as AdminClient | undefined) ?? createServiceRoleClient();
  const { data: stores, error } = await admin
    .from("stores")
    .select("owner_user_id")
    .eq("crm_enabled", true)
    .limit(Math.min(Math.max(args?.maxStores ?? 20, 1), 100));
  if (error) throw new Error(`Could not load CRM-enabled stores: ${error.message}`);

  const results: Array<{
    userId: string;
    success: boolean;
    proposed?: number;
    skippedForConsent?: number;
    error?: string;
  }> = [];
  for (const store of stores ?? []) {
    const userId = String(store.owner_user_id);
    try {
      const run = await runBikeStoreProgrammesForUser({ userId, admin });
      results.push({ userId, success: true, ...run });
    } catch (runError) {
      results.push({
        userId,
        success: false,
        error: runError instanceof Error ? runError.message : "Bike programme run failed",
      });
    }
  }
  return {
    checked: stores?.length ?? 0,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}
