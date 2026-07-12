import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

const PAGE_LIMIT = 500;
const WRITE_CHUNK = 200;

type CustomerEventInsert = {
  store_id: string;
  customer_id: string;
  event_type: string;
  channel: string | null;
  source_type: string;
  source_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  actor_type: "customer" | "staff" | "agent" | "system";
  direction: "inbound" | "outbound" | "internal" | null;
  metadata: Record<string, unknown>;
};

function chunks<T>(values: T[], size = WRITE_CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function normaliseEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function normalisePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("61") && digits.length >= 11 ? `0${digits.slice(2)}` : digits;
}

function iso(value: unknown): string {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

async function storeIdForOwner(admin: AdminClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve CRM store: ${error.message}`);
  if (!data) throw new Error("CRM store foundation is not initialised.");
  return String(data.id);
}

async function identityMap(
  admin: AdminClient,
  storeId: string,
  identityType: "email" | "phone",
  values: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const part of chunks([...new Set(values.filter(Boolean))])) {
    const { data, error } = await admin
      .from("store_customer_identities")
      .select("normalized_value, customer_id")
      .eq("store_id", storeId)
      .eq("identity_type", identityType)
      .in("normalized_value", part);
    if (error) throw new Error(`Could not load ${identityType} identities: ${error.message}`);
    for (const row of data ?? []) map.set(String(row.normalized_value), String(row.customer_id));
  }
  return map;
}

async function linkUnmatchedSources(
  admin: AdminClient,
  storeId: string,
  userId: string,
): Promise<{ inquiries: number; conversations: number; payments: number }> {
  const [{ data: inquiries }, { data: conversations }, { data: payments }] = await Promise.all([
    admin
      .from("store_customer_inquiries")
      .select("id, sender_email")
      .eq("user_id", userId)
      .is("customer_id", null)
      .limit(PAGE_LIMIT),
    admin
      .from("store_nest_conversations")
      .select("id, participant_handle")
      .eq("user_id", userId)
      .is("customer_id", null)
      .limit(PAGE_LIMIT),
    admin
      .from("store_payment_requests")
      .select("id, customer_handle")
      .eq("store_user_id", userId)
      .is("customer_id", null)
      .limit(PAGE_LIMIT),
  ]);

  const emailByCustomer = await identityMap(
    admin,
    storeId,
    "email",
    (inquiries ?? []).map((row) => normaliseEmail(row.sender_email)).filter((value): value is string => Boolean(value)),
  );
  const phones = [
    ...(conversations ?? []).map((row) => normalisePhone(row.participant_handle)),
    ...(payments ?? []).map((row) => normalisePhone(row.customer_handle)),
  ].filter((value): value is string => Boolean(value));
  const phoneByCustomer = await identityMap(admin, storeId, "phone", phones);

  let linkedInquiries = 0;
  let linkedConversations = 0;
  let linkedPayments = 0;

  for (const row of inquiries ?? []) {
    const email = normaliseEmail(row.sender_email);
    const customerId = email ? emailByCustomer.get(email) : null;
    if (!customerId) continue;
    const { error } = await admin
      .from("store_customer_inquiries")
      .update({ customer_id: customerId })
      .eq("id", row.id)
      .is("customer_id", null);
    if (!error) linkedInquiries += 1;
  }
  for (const row of conversations ?? []) {
    const phone = normalisePhone(row.participant_handle);
    const customerId = phone ? phoneByCustomer.get(phone) : null;
    if (!customerId) continue;
    const { error } = await admin
      .from("store_nest_conversations")
      .update({ customer_id: customerId })
      .eq("id", row.id)
      .is("customer_id", null);
    if (!error) linkedConversations += 1;
  }
  for (const row of payments ?? []) {
    const phone = normalisePhone(row.customer_handle);
    const customerId = phone ? phoneByCustomer.get(phone) : null;
    if (!customerId) continue;
    const { error } = await admin
      .from("store_payment_requests")
      .update({ customer_id: customerId })
      .eq("id", row.id)
      .is("customer_id", null);
    if (!error) linkedPayments += 1;
  }

  return {
    inquiries: linkedInquiries,
    conversations: linkedConversations,
    payments: linkedPayments,
  };
}

async function buildSourceEvents(
  admin: AdminClient,
  storeId: string,
  userId: string,
): Promise<CustomerEventInsert[]> {
  const [
    { data: inquiries, error: inquiryError },
    { data: conversations, error: conversationError },
    { data: campaigns, error: campaignError },
    { data: lifecycle, error: lifecycleError },
    { data: domestique, error: domestiqueError },
    { data: payments, error: paymentError },
  ] = await Promise.all([
    admin
      .from("store_customer_inquiries")
      .select("id, customer_id, sender_name, sender_email, subject, snippet, status, intent, priority, received_at, sent_at, updated_at")
      .eq("user_id", userId)
      .not("customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(PAGE_LIMIT),
    admin
      .from("store_nest_conversations")
      .select("id, customer_id, chat_id, display_name, preview, source, channel, last_message_at, last_customer_message_at, has_manual_messages")
      .eq("user_id", userId)
      .not("customer_id", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(PAGE_LIMIT),
    admin
      .from("crm_campaign_recipients")
      .select("id, status, email, sent_at, created_at, crm_contacts!inner(customer_id), crm_campaigns!inner(subject)")
      .eq("user_id", userId)
      .not("crm_contacts.customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT),
    admin
      .from("crm_lifecycle_touches")
      .select("id, store_customer_id, program_key, stage_at_touch, is_holdout, touched_at, attributed_revenue, reactivated")
      .eq("user_id", userId)
      .not("store_customer_id", "is", null)
      .order("touched_at", { ascending: false })
      .limit(PAGE_LIMIT),
    admin
      .from("domestique_touches")
      .select("id, store_customer_id, playbook_key, channel, is_holdout, touched_at, attributed_revenue")
      .eq("user_id", userId)
      .not("store_customer_id", "is", null)
      .order("touched_at", { ascending: false })
      .limit(PAGE_LIMIT),
    admin
      .from("store_payment_requests")
      .select("id, customer_id, amount_cents, currency, description, status, paid_at, created_at, updated_at")
      .eq("store_user_id", userId)
      .not("customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(PAGE_LIMIT),
  ]);

  const sourceErrors = [
    inquiryError,
    conversationError,
    campaignError,
    lifecycleError,
    domestiqueError,
    paymentError,
  ].filter(Boolean);
  if (sourceErrors.length > 0) {
    throw new Error(`Could not load CRM timeline sources: ${sourceErrors.map((error) => error?.message).join("; ")}`);
  }

  const events: CustomerEventInsert[] = [];
  for (const inquiry of inquiries ?? []) {
    events.push({
      store_id: storeId,
      customer_id: String(inquiry.customer_id),
      event_type: inquiry.status === "sent" ? "email_reply" : "email_inquiry",
      channel: "email",
      source_type: "customer_inquiry",
      source_id: String(inquiry.id),
      title: String(inquiry.subject || "Customer enquiry"),
      summary: String(inquiry.snippet || `${inquiry.intent} · ${inquiry.status}`),
      occurred_at: iso(inquiry.sent_at ?? inquiry.received_at ?? inquiry.updated_at),
      actor_type: inquiry.status === "sent" ? "staff" : "customer",
      direction: inquiry.status === "sent" ? "outbound" : "inbound",
      metadata: {
        status: inquiry.status,
        intent: inquiry.intent,
        priority: inquiry.priority,
        sender_name: inquiry.sender_name,
        sender_email: inquiry.sender_email,
      },
    });
  }
  for (const conversation of conversations ?? []) {
    events.push({
      store_id: storeId,
      customer_id: String(conversation.customer_id),
      event_type: "nest_conversation",
      channel: String(conversation.channel || "sms"),
      source_type: "nest_conversation",
      source_id: String(conversation.chat_id || conversation.id),
      title: String(conversation.display_name || "Nest conversation"),
      summary: String(conversation.preview || "Conversation updated"),
      occurred_at: iso(conversation.last_message_at),
      actor_type: conversation.has_manual_messages ? "staff" : "customer",
      direction: conversation.has_manual_messages ? "outbound" : "inbound",
      metadata: {
        source: conversation.source,
        last_customer_message_at: conversation.last_customer_message_at,
      },
    });
  }
  for (const recipient of campaigns ?? []) {
    const contactRelation = Array.isArray(recipient.crm_contacts)
      ? recipient.crm_contacts[0]
      : recipient.crm_contacts;
    const campaignRelation = Array.isArray(recipient.crm_campaigns)
      ? recipient.crm_campaigns[0]
      : recipient.crm_campaigns;
    const customerId = (contactRelation as { customer_id?: string } | null)?.customer_id;
    if (!customerId) continue;
    events.push({
      store_id: storeId,
      customer_id: String(customerId),
      event_type: "campaign_email",
      channel: "email",
      source_type: "crm_campaign_recipient",
      source_id: String(recipient.id),
      title: String((campaignRelation as { subject?: string } | null)?.subject || "Campaign email"),
      summary: `Campaign ${String(recipient.status || "pending")}`,
      occurred_at: iso(recipient.sent_at ?? recipient.created_at),
      actor_type: "agent",
      direction: "outbound",
      metadata: { status: recipient.status, email: recipient.email },
    });
  }
  for (const touch of lifecycle ?? []) {
    events.push({
      store_id: storeId,
      customer_id: String(touch.store_customer_id),
      event_type: "lifecycle_touch",
      channel: touch.is_holdout ? null : "email",
      source_type: "crm_lifecycle_touch",
      source_id: String(touch.id),
      title: String(touch.program_key || "Lifecycle programme"),
      summary: touch.is_holdout ? "Held out from contact" : `Contacted while ${String(touch.stage_at_touch)}`,
      occurred_at: iso(touch.touched_at),
      actor_type: "agent",
      direction: "outbound",
      metadata: {
        stage: touch.stage_at_touch,
        holdout: touch.is_holdout,
        attributed_revenue: touch.attributed_revenue,
        reactivated: touch.reactivated,
      },
    });
  }
  for (const touch of domestique ?? []) {
    events.push({
      store_id: storeId,
      customer_id: String(touch.store_customer_id),
      event_type: "domestique_touch",
      channel: touch.is_holdout ? null : String(touch.channel || "email"),
      source_type: "domestique_touch",
      source_id: String(touch.id),
      title: String(touch.playbook_key || "Domestique play"),
      summary: touch.is_holdout ? "Held out from contact" : "Revenue play sent",
      occurred_at: iso(touch.touched_at),
      actor_type: "agent",
      direction: "outbound",
      metadata: {
        holdout: touch.is_holdout,
        attributed_revenue: touch.attributed_revenue,
      },
    });
  }
  for (const payment of payments ?? []) {
    events.push({
      store_id: storeId,
      customer_id: String(payment.customer_id),
      event_type: payment.status === "paid" ? "payment_received" : "payment_request",
      channel: "payment",
      source_type: "store_payment_request",
      source_id: String(payment.id),
      title: payment.status === "paid" ? "Payment received" : "Payment requested",
      summary: `${(Number(payment.amount_cents) / 100).toLocaleString("en-AU", {
        style: "currency",
        currency: String(payment.currency || "AUD").toUpperCase(),
      })}${payment.description ? ` · ${String(payment.description)}` : ""}`,
      occurred_at: iso(payment.paid_at ?? payment.created_at),
      actor_type: "staff",
      direction: "outbound",
      metadata: { status: payment.status, amount_cents: payment.amount_cents },
    });
  }

  return events;
}

async function syncLifecycleStages(
  admin: AdminClient,
  storeId: string,
  userId: string,
): Promise<number> {
  const { data: states, error: stateError } = await admin
    .from("crm_lifecycle_states")
    .select("contact_id, stage")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(PAGE_LIMIT);
  if (stateError) throw new Error(`Could not load lifecycle stages: ${stateError.message}`);
  const contactIds = (states ?? []).map((state) => String(state.contact_id));
  if (contactIds.length === 0) return 0;

  const { data: contacts, error: contactError } = await admin
    .from("crm_contacts")
    .select("id, customer_id")
    .eq("user_id", userId)
    .not("customer_id", "is", null)
    .in("id", contactIds);
  if (contactError) throw new Error(`Could not resolve lifecycle customers: ${contactError.message}`);
  const customerByContact = new Map(
    (contacts ?? []).map((contact) => [String(contact.id), String(contact.customer_id)]),
  );

  let updated = 0;
  for (const state of states ?? []) {
    const customerId = customerByContact.get(String(state.contact_id));
    if (!customerId) continue;
    const { error } = await admin
      .from("store_customers")
      .update({ lifecycle_stage: state.stage })
      .eq("store_id", storeId)
      .eq("id", customerId);
    if (!error) updated += 1;
  }
  return updated;
}

export async function projectCustomerTimelineForUser(args: {
  userId: string;
  admin?: SupabaseClient;
}): Promise<{
  linked: { inquiries: number; conversations: number; payments: number };
  projected: number;
}> {
  const admin = (args.admin as AdminClient | undefined) ?? createServiceRoleClient();
  const storeId = await storeIdForOwner(admin, args.userId);
  const linked = await linkUnmatchedSources(admin, storeId, args.userId);
  const lifecycleStagesUpdated = await syncLifecycleStages(admin, storeId, args.userId);
  const events = await buildSourceEvents(admin, storeId, args.userId);

  for (const part of chunks(events)) {
    const { error } = await admin.from("store_customer_events").upsert(part, {
      onConflict: "store_id,source_type,source_id,event_type",
    });
    if (error) throw new Error(`Could not project customer timeline: ${error.message}`);
  }

  const latestByCustomer = new Map<string, string>();
  for (const event of events) {
    const current = latestByCustomer.get(event.customer_id);
    if (!current || Date.parse(event.occurred_at) > Date.parse(current)) {
      latestByCustomer.set(event.customer_id, event.occurred_at);
    }
  }
  for (const [customerId, lastInteractionAt] of latestByCustomer) {
    await admin
      .from("store_customers")
      .update({ last_interaction_at: lastInteractionAt })
      .eq("store_id", storeId)
      .eq("id", customerId);
  }

  const now = new Date().toISOString();
  await admin.from("store_crm_sync_state").upsert({
    store_id: storeId,
    source: "timeline",
    status: "completed",
    last_started_at: now,
    last_completed_at: now,
    last_successful_at: now,
    records_processed: events.length,
    metadata: { linked, lifecycle_stages_updated: lifecycleStagesUpdated },
    updated_at: now,
  }, { onConflict: "store_id,source" });

  return { linked, projected: events.length };
}
