import { createHash, randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type MyGarageConsent = {
  channel: "email" | "sms" | "voice" | "push";
  purpose: "marketing" | "service" | "transactional" | "community";
  status: "granted" | "denied" | "withdrawn" | "unknown";
};

export type MyGaragePayload = {
  store: { id: string; ownerUserId: string; name: string };
  customer: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    lifecycleStage: string | null;
    nextServiceDueAt: string | null;
  };
  bikes: Array<{
    id: string;
    label: string;
    serialNumber: string | null;
    colour: string | null;
    isEbike: boolean;
    lastServiceAt: string | null;
    nextServiceDueAt: string | null;
  }>;
  workorders: Array<{
    id: string;
    number: string | null;
    title: string;
    status: string;
    statusLabel: string | null;
    promisedAt: string | null;
    updatedAt: string;
  }>;
  consents: MyGarageConsent[];
  events: Array<{
    id: string;
    title: string;
    summary: string;
    channel: string | null;
    occurredAt: string;
  }>;
  communityEvents: Array<{
    id: string;
    title: string;
    eventType: string;
    description: string;
    startsAt: string;
    registered: boolean;
  }>;
  loyalty: {
    enabled: boolean;
    name: string;
    points: number;
  };
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createMyGarageLink(args: {
  ownerUserId: string;
  customerId: string;
  expiresInDays?: number;
}): Promise<{ token: string; expiresAt: string }> {
  const admin = createServiceRoleClient();
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id")
    .eq("owner_user_id", args.ownerUserId)
    .maybeSingle();
  if (storeError) throw new Error(`Could not load store: ${storeError.message}`);
  if (!store) throw new Error("CRM store is not initialised.");

  const { data: customer, error: customerError } = await admin
    .from("store_customers")
    .select("id")
    .eq("id", args.customerId)
    .eq("store_id", store.id)
    .eq("status", "active")
    .maybeSingle();
  if (customerError) throw new Error(`Could not load customer: ${customerError.message}`);
  if (!customer) throw new Error("Customer was not found.");

  const token = randomBytes(32).toString("base64url");
  const days = Math.min(Math.max(args.expiresInDays ?? 30, 1), 90);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("store_customer_portal_tokens").insert({
    store_id: store.id,
    customer_id: customer.id,
    token_hash: tokenHash(token),
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Could not create My Garage link: ${error.message}`);
  return { token, expiresAt };
}

async function resolvePortalToken(token: string): Promise<{
  storeId: string;
  customerId: string;
}> {
  if (token.length < 32 || token.length > 200) throw new Error("This My Garage link is invalid.");
  const admin = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("store_customer_portal_tokens")
    .select("id, store_id, customer_id")
    .eq("token_hash", tokenHash(token))
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error) throw new Error(`Could not verify My Garage link: ${error.message}`);
  if (!data) throw new Error("This My Garage link has expired or is no longer available.");

  await admin
    .from("store_customer_portal_tokens")
    .update({ last_used_at: now })
    .eq("id", data.id)
    .then(() => undefined);

  return { storeId: String(data.store_id), customerId: String(data.customer_id) };
}

export async function getMyGaragePayload(token: string): Promise<MyGaragePayload> {
  const admin = createServiceRoleClient();
  const { storeId, customerId } = await resolvePortalToken(token);
  const now = new Date().toISOString();

  const [
    storeResult,
    customerResult,
    bikesResult,
    workordersResult,
    consentsResult,
    eventsResult,
    communityResult,
    attendanceResult,
    loyaltyProgrammeResult,
    loyaltyLedgerResult,
  ] = await Promise.all([
    admin.from("stores").select("id, owner_user_id, name").eq("id", storeId).single(),
    admin
      .from("store_customers")
      .select("id, display_name, primary_email, primary_phone, lifecycle_stage, next_service_due_at")
      .eq("id", customerId)
      .eq("store_id", storeId)
      .single(),
    admin
      .from("store_customer_bikes")
      .select("id, brand, model, serial_number, colour, is_ebike, last_service_at, next_service_due_at")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .order("updated_at", { ascending: false }),
    admin
      .from("store_customer_workorders")
      .select("id, workorder_number, title, status, status_label, promised_at, updated_at")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .order("updated_at", { ascending: false })
      .limit(20),
    admin
      .from("store_customer_consents")
      .select("channel, purpose, status")
      .eq("store_id", storeId)
      .eq("customer_id", customerId),
    admin
      .from("store_customer_events")
      .select("id, title, summary, channel, occurred_at")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .order("occurred_at", { ascending: false })
      .limit(20),
    admin
      .from("store_community_events")
      .select("id, title, event_type, description, starts_at")
      .eq("store_id", storeId)
      .eq("status", "published")
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(20),
    admin
      .from("store_community_attendance")
      .select("event_id, status")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .in("status", ["registered", "attended"]),
    admin
      .from("store_loyalty_programmes")
      .select("enabled, programme_name")
      .eq("store_id", storeId)
      .maybeSingle(),
    admin
      .from("store_loyalty_ledger")
      .select("points")
      .eq("store_id", storeId)
      .eq("customer_id", customerId),
  ]);

  const firstError = [
    storeResult.error,
    customerResult.error,
    bikesResult.error,
    workordersResult.error,
    consentsResult.error,
    eventsResult.error,
    communityResult.error,
    attendanceResult.error,
    loyaltyProgrammeResult.error,
    loyaltyLedgerResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(`Could not load My Garage: ${firstError.message}`);
  if (!storeResult.data || !customerResult.data) {
    throw new Error("This My Garage profile is no longer available.");
  }

  const customer = customerResult.data;
  const registeredEvents = new Set(
    (attendanceResult.data ?? []).map((row) => String(row.event_id)),
  );
  const points = (loyaltyLedgerResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.points ?? 0),
    0,
  );

  return {
    store: {
      id: String(storeResult.data.id),
      ownerUserId: String(storeResult.data.owner_user_id),
      name: String(storeResult.data.name),
    },
    customer: {
      id: String(customer.id),
      displayName: String(customer.display_name),
      email: customer.primary_email ? String(customer.primary_email) : null,
      phone: customer.primary_phone ? String(customer.primary_phone) : null,
      lifecycleStage: customer.lifecycle_stage ? String(customer.lifecycle_stage) : null,
      nextServiceDueAt: customer.next_service_due_at ? String(customer.next_service_due_at) : null,
    },
    bikes: (bikesResult.data ?? []).map((bike) => ({
      id: String(bike.id),
      label: [bike.brand, bike.model].filter(Boolean).join(" ") || "Your bike",
      serialNumber: bike.serial_number ? String(bike.serial_number) : null,
      colour: bike.colour ? String(bike.colour) : null,
      isEbike: Boolean(bike.is_ebike),
      lastServiceAt: bike.last_service_at ? String(bike.last_service_at) : null,
      nextServiceDueAt: bike.next_service_due_at ? String(bike.next_service_due_at) : null,
    })),
    workorders: (workordersResult.data ?? []).map((workorder) => ({
      id: String(workorder.id),
      number: workorder.workorder_number ? String(workorder.workorder_number) : null,
      title: String(workorder.title),
      status: String(workorder.status),
      statusLabel: workorder.status_label ? String(workorder.status_label) : null,
      promisedAt: workorder.promised_at ? String(workorder.promised_at) : null,
      updatedAt: String(workorder.updated_at),
    })),
    consents: (consentsResult.data ?? []) as MyGarageConsent[],
    events: (eventsResult.data ?? []).map((event) => ({
      id: String(event.id),
      title: String(event.title),
      summary: String(event.summary),
      channel: event.channel ? String(event.channel) : null,
      occurredAt: String(event.occurred_at),
    })),
    communityEvents: (communityResult.data ?? []).map((event) => ({
      id: String(event.id),
      title: String(event.title),
      eventType: String(event.event_type),
      description: String(event.description),
      startsAt: String(event.starts_at),
      registered: registeredEvents.has(String(event.id)),
    })),
    loyalty: {
      enabled: Boolean(loyaltyProgrammeResult.data?.enabled),
      name: String(loyaltyProgrammeResult.data?.programme_name ?? "Rider rewards"),
      points,
    },
  };
}

export async function updateMyGarageConsent(args: {
  token: string;
  channel: MyGarageConsent["channel"];
  purpose: MyGarageConsent["purpose"];
  granted: boolean;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const { storeId, customerId } = await resolvePortalToken(args.token);
  const now = new Date().toISOString();
  const { error } = await admin.from("store_customer_consents").upsert({
    store_id: storeId,
    customer_id: customerId,
    channel: args.channel,
    purpose: args.purpose,
    status: args.granted ? "granted" : "withdrawn",
    lawful_basis: args.granted ? "express" : "unknown",
    source: "my_garage",
    evidence: { customer_portal: true },
    captured_at: now,
    withdrawn_at: args.granted ? null : now,
    updated_at: now,
  }, { onConflict: "store_id,customer_id,channel,purpose" });
  if (error) throw new Error(`Could not update communication preferences: ${error.message}`);

  // Existing campaign rails still read crm_contacts.opted_out. Keep that
  // suppression flag in lockstep so a portal withdrawal takes effect
  // immediately everywhere, not only in the new CRM.
  if (args.channel === "email" && args.purpose === "marketing") {
    const { error: legacyError } = await admin
      .from("crm_contacts")
      .update({
        opted_out: !args.granted,
        opted_out_at: args.granted ? null : now,
        opt_out_reason: args.granted ? null : "my_garage",
      })
      .eq("customer_id", customerId);
    if (legacyError) {
      throw new Error(`Preference saved, but legacy email suppression failed: ${legacyError.message}`);
    }
  }
}

export async function updateMyGarageAttendance(args: {
  token: string;
  eventId: string;
  registered: boolean;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const { storeId, customerId } = await resolvePortalToken(args.token);
  const { data: event, error: eventError } = await admin
    .from("store_community_events")
    .select("id, capacity")
    .eq("id", args.eventId)
    .eq("store_id", storeId)
    .eq("status", "published")
    .maybeSingle();
  if (eventError) throw new Error(`Could not load community event: ${eventError.message}`);
  if (!event) throw new Error("This community event is no longer available.");

  if (args.registered && event.capacity != null) {
    const { count, error: countError } = await admin
      .from("store_community_attendance")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("event_id", event.id)
      .in("status", ["registered", "attended"]);
    if (countError) throw new Error(`Could not check event availability: ${countError.message}`);
    if ((count ?? 0) >= Number(event.capacity)) throw new Error("This event is currently full.");
  }

  const { error } = await admin.from("store_community_attendance").upsert({
    store_id: storeId,
    event_id: event.id,
    customer_id: customerId,
    status: args.registered ? "registered" : "cancelled",
    registered_at: new Date().toISOString(),
  }, { onConflict: "event_id,customer_id" });
  if (error) throw new Error(`Could not update event registration: ${error.message}`);
}
