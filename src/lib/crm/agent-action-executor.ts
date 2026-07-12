import type { SupabaseClient } from "@supabase/supabase-js";
import { createCampaignFromAgent } from "@/lib/crm/agent/create-campaign";
import { sendCrmCampaign } from "@/lib/crm/send-campaign";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { formatNestOutboundMessage } from "@/lib/nest/message-format";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";

type AgentActionRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  agent_key: string;
  programme_key: string | null;
  action_type: string;
  channel: "email" | "sms" | null;
  status: string;
  title: string;
  proposed_payload: Record<string, unknown>;
  policy_decision: Record<string, unknown>;
  payload_hash: string | null;
};

function messageFromPayload(payload: Record<string, unknown>): string {
  const message = String(payload.message ?? payload.body ?? "").trim();
  if (!message) throw new Error("The proposed action has no message body.");
  return message.slice(0, 5000);
}

async function assertConsent(args: {
  supabase: SupabaseClient;
  storeId: string;
  customerId: string;
  channel: "email" | "sms";
  policy: Record<string, unknown>;
}): Promise<void> {
  const purpose = String(args.policy.consent_purpose ?? "marketing");
  const operational = args.policy.operational === true;
  const { data, error } = await args.supabase
    .from("store_customer_consents")
    .select("status")
    .eq("store_id", args.storeId)
    .eq("customer_id", args.customerId)
    .eq("channel", args.channel)
    .eq("purpose", purpose)
    .maybeSingle();
  if (error) throw new Error(`Could not verify consent: ${error.message}`);
  const status = String(data?.status ?? "unknown");
  if (status === "denied" || status === "withdrawn") {
    throw new Error(`The customer has opted out of ${args.channel} ${purpose} messages.`);
  }
  if (!operational && status !== "granted") {
    throw new Error(`Express ${args.channel} ${purpose} consent is required before sending.`);
  }
}

async function executeEmail(args: {
  supabase: SupabaseClient;
  userId: string;
  action: AgentActionRow;
  customerId: string;
}): Promise<Record<string, unknown>> {
  const { data: contact, error } = await args.supabase
    .from("crm_contacts")
    .select("id, email, opted_out")
    .eq("user_id", args.userId)
    .eq("customer_id", args.customerId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the customer's email record: ${error.message}`);
  if (!contact || contact.opted_out || !contact.email) {
    throw new Error("This customer does not have an eligible CRM email record.");
  }

  const message = messageFromPayload(args.action.proposed_payload);
  const templateKey = args.action.programme_key?.includes("service")
    || args.action.programme_key?.includes("workorder")
    ? "service_reminder"
    : "store_announcement";
  const { campaignId } = await createCampaignFromAgent(args.supabase, args.userId, {
    subject: args.action.title.slice(0, 200),
    templateKey,
    content: {
      title: args.action.title.slice(0, 200),
      body: message,
      footerText: "You're receiving this because you're a customer of our store.",
    },
    contactIds: [String(contact.id)],
  });
  const result = await sendCrmCampaign(args.supabase, args.userId, campaignId);
  if (!result.success) throw new Error("The email provider did not send the message.");
  return { campaign_id: campaignId, emails_sent: result.sent, emails_failed: result.failed };
}

async function executeSms(args: {
  supabase: SupabaseClient;
  userId: string;
  action: AgentActionRow;
  customerId: string;
}): Promise<Record<string, unknown>> {
  const [{ data: profile, error: profileError }, { data: customer, error: customerError }] = await Promise.all([
    args.supabase
      .from("users")
      .select("nest_brand_key, business_name, nest_message_intro, nest_message_signoff")
      .eq("user_id", args.userId)
      .maybeSingle(),
    args.supabase
      .from("store_customers")
      .select("display_name, first_name, primary_phone")
      .eq("store_id", args.action.store_id)
      .eq("id", args.customerId)
      .maybeSingle(),
  ]);
  if (profileError) throw new Error(`Could not load Nest settings: ${profileError.message}`);
  if (customerError) throw new Error(`Could not load customer: ${customerError.message}`);
  if (!customer?.primary_phone) throw new Error("This customer does not have a mobile number.");

  const brandKey = resolveStoreNestBrandKey(profile);
  const content = formatNestOutboundMessage(messageFromPayload(args.action.proposed_payload), {
    firstName: customer.first_name ?? String(customer.display_name ?? "").split(" ")[0] ?? null,
    storeName: profile?.business_name as string | null,
    templates: {
      intro: (profile?.nest_message_intro as string | null) ?? undefined,
      signoff: (profile?.nest_message_signoff as string | null) ?? undefined,
    },
  });
  const response = await proxyNestBrandPortalRequest(brandKey, {
    method: "POST",
    body: {
      action: "start_message",
      mobile: customer.primary_phone,
      content,
      customerName: customer.display_name ?? undefined,
    },
  });
  return { sms_sent: 1, nest: response };
}

export async function executeStoreAgentAction(args: {
  supabase: SupabaseClient;
  userId: string;
  actorUserId: string;
  actionId: string;
}): Promise<Record<string, unknown>> {
  const { data: row, error: fetchError } = await args.supabase
    .from("store_agent_actions")
    .select("id, store_id, customer_id, agent_key, programme_key, action_type, channel, status, title, proposed_payload, policy_decision, payload_hash")
    .eq("id", args.actionId)
    .maybeSingle();
  if (fetchError) throw new Error(`Could not load agent action: ${fetchError.message}`);
  if (!row) throw new Error("Agent action was not found.");
  const action = row as AgentActionRow;
  if (!action.customer_id || !action.channel) {
    throw new Error("The agent action is missing a customer or outbound channel.");
  }
  if (action.status !== "approved" && action.status !== "executing") {
    throw new Error(`The agent action is ${action.status} and cannot be executed.`);
  }

  await assertConsent({
    supabase: args.supabase,
    storeId: action.store_id,
    customerId: action.customer_id,
    channel: action.channel,
    policy: action.policy_decision,
  });

  const { data: claimed, error: claimError } = await args.supabase
    .from("store_agent_actions")
    .update({ status: "executing", error_message: null })
    .eq("id", action.id)
    .in("status", ["approved", "executing"])
    .select("id");
  if (claimError) throw new Error(`Could not claim agent action: ${claimError.message}`);
  if (!claimed || claimed.length === 0) throw new Error("Agent action was already executed.");

  try {
    const result = action.channel === "email"
      ? await executeEmail({
          supabase: args.supabase,
          userId: args.userId,
          action,
          customerId: action.customer_id,
        })
      : await executeSms({
          supabase: args.supabase,
          userId: args.userId,
          action,
          customerId: action.customer_id,
        });
    const now = new Date().toISOString();
    await args.supabase
      .from("store_agent_actions")
      .update({ status: "completed", result, executed_at: now })
      .eq("id", action.id);
    await args.supabase.from("store_agent_action_audit").insert({
      store_id: action.store_id,
      action_id: action.id,
      event_type: "executed",
      actor_user_id: args.actorUserId,
      from_status: "executing",
      to_status: "completed",
      payload_hash: action.payload_hash,
      detail: result,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent action execution failed";
    await args.supabase
      .from("store_agent_actions")
      .update({ status: "failed", error_message: message })
      .eq("id", action.id);
    await args.supabase.from("store_agent_action_audit").insert({
      store_id: action.store_id,
      action_id: action.id,
      event_type: "failed",
      actor_user_id: args.actorUserId,
      from_status: "executing",
      to_status: "failed",
      payload_hash: action.payload_hash,
      detail: { error: message },
    });
    throw error;
  }
}
