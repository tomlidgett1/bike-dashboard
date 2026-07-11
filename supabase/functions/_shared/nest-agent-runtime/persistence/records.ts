import { getAdminClient } from "../../supabase.ts";
import { NESTV3_RPCS, NESTV3_TABLES } from "../constants.ts";

type JsonRecord = Record<string, unknown>;

export async function createAgentSpec(args: {
  authUserId: string | null;
  senderHandle: string;
  chatId: string;
  name: string;
  slug: string;
  description?: string | null;
  markdownBody: string;
  sourceRunId: string;
  metadata?: JsonRecord;
}): Promise<string> {
  const supabase = getAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from(NESTV3_TABLES.agentSpecs)
    .select("version")
    .eq("sender_handle", args.senderHandle)
    .eq("slug", args.slug)
    .order("version", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to inspect NESTV3_agent_specs versions: ${existingError.message}`);
  }

  const version = Array.isArray(existing) && existing[0]?.version
    ? Number(existing[0].version) + 1
    : 1;

  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.agentSpecs)
    .insert({
      auth_user_id: args.authUserId,
      sender_handle: args.senderHandle,
      chat_id: args.chatId,
      name: args.name,
      slug: args.slug,
      description: args.description ?? null,
      markdown_body: args.markdownBody,
      status: "active",
      source_run_id: args.sourceRunId,
      version,
      metadata: args.metadata ?? {},
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create NESTV3_agent_specs row: ${error?.message ?? "missing id"}`);
  }
  return String(data.id);
}

export async function createAutomation(args: {
  agentSpecId: string;
  authUserId: string | null;
  senderHandle: string;
  chatId: string;
  cronExpression: string;
  timezone: string;
  nextRunAt: string;
  metadata?: JsonRecord;
}): Promise<string> {
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.automations)
    .insert({
      agent_spec_id: args.agentSpecId,
      auth_user_id: args.authUserId,
      sender_handle: args.senderHandle,
      chat_id: args.chatId,
      enabled: true,
      status: "active",
      cron_expression: args.cronExpression,
      timezone: args.timezone,
      next_run_at: args.nextRunAt,
      metadata: args.metadata ?? {},
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create NESTV3_automations row: ${error?.message ?? "missing id"}`);
  }
  return String(data.id);
}

export async function cancelAutomation(args: {
  automationId: string;
  reason: string;
}): Promise<{ id: string; cancelled: boolean }> {
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.automations)
    .update({
      enabled: false,
      status: "disabled",
      last_error: args.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.automationId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to cancel NESTV3_automation: ${error.message}`);
  return { id: String(data?.id ?? args.automationId), cancelled: Boolean(data?.id) };
}

export async function upsertConnectedAccount(args: {
  authUserId: string | null;
  senderHandle: string;
  composioUserId: string;
  toolkitSlug: string;
  connectedAccountId?: string | null;
  providerSlug?: string | null;
  status: "pending" | "active" | "expired" | "revoked" | "failed";
  label?: string | null;
  metadata?: JsonRecord;
}): Promise<void> {
  const { error } = await getAdminClient()
    .from(NESTV3_TABLES.userConnectedAccounts)
    .upsert(
      {
        auth_user_id: args.authUserId,
        sender_handle: args.senderHandle,
        composio_user_id: args.composioUserId,
        toolkit_slug: args.toolkitSlug,
        provider_slug: args.providerSlug ?? args.toolkitSlug,
        connected_account_id: args.connectedAccountId ?? null,
        status: args.status,
        label: args.label ?? null,
        metadata: args.metadata ?? {},
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "composio_user_id,toolkit_slug,connected_account_id" },
    );

  if (error) throw new Error(`Failed to upsert NESTV3_user_connected_accounts: ${error.message}`);
}

export async function createPendingIntent(args: {
  originalRunId: string;
  authUserId: string | null;
  senderHandle: string;
  botNumber: string | null;
  chatId: string;
  composioUserId: string;
  originalMessage: string;
  requiredApps: string[];
  requiredToolkits: string[];
  candidateApps?: string[];
  resumeContext?: JsonRecord;
}): Promise<string> {
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.agentPendingIntents)
    .insert({
      original_run_id: args.originalRunId,
      auth_user_id: args.authUserId,
      sender_handle: args.senderHandle,
      bot_number: args.botNumber,
      chat_id: args.chatId,
      composio_user_id: args.composioUserId,
      original_message: args.originalMessage,
      required_apps: args.requiredApps,
      required_toolkits: args.requiredToolkits,
      candidate_apps: args.candidateApps ?? [],
      resume_context: args.resumeContext ?? {},
      status: "waiting_for_connection",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create NESTV3_agent_pending_intents: ${error?.message ?? "missing id"}`);
  }
  return String(data.id);
}

export async function listReadyPendingIntents(composioUserId: string) {
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.agentPendingIntents)
    .select("*")
    .eq("composio_user_id", composioUserId)
    .in("status", ["waiting_for_connection", "ready_to_resume"]);

  if (error) throw new Error(`Failed to list pending intents: ${error.message}`);
  return data ?? [];
}

export async function updatePendingIntentStatus(
  id: string,
  status: "ready_to_resume" | "resuming" | "completed" | "expired" | "failed" | "cancelled",
  patch: JsonRecord = {},
): Promise<void> {
  const { error } = await getAdminClient()
    .from(NESTV3_TABLES.agentPendingIntents)
    .update({ ...patch, status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to update pending intent: ${error.message}`);
}

export async function claimScheduledRun(args: {
  automationId: string;
  runKey: string;
  scheduledFor: string;
  inputPayload?: JsonRecord;
}): Promise<{ runId: string | null; claimed: boolean; status: string }> {
  const { data, error } = await getAdminClient()
    .rpc(NESTV3_RPCS.claimScheduledRun, {
      p_automation_id: args.automationId,
      p_run_key: args.runKey,
      p_scheduled_for: args.scheduledFor,
      p_input_payload: args.inputPayload ?? {},
    });

  if (error) throw new Error(`Failed to claim scheduled run: ${error.message}`);
  const first = Array.isArray(data) ? data[0] : null;
  return {
    runId: first?.run_id ?? null,
    claimed: Boolean(first?.claimed),
    status: String(first?.status ?? "missing"),
  };
}

export async function touchAutomation(args: {
  automationId: string;
  nextRunAt: string;
  success: boolean;
  lastError?: string | null;
}): Promise<void> {
  const { error } = await getAdminClient()
    .rpc(NESTV3_RPCS.touchAutomation, {
      p_automation_id: args.automationId,
      p_next_run_at: args.nextRunAt,
      p_success: args.success,
      p_last_error: args.lastError ?? null,
    });
  if (error) throw new Error(`Failed to touch automation: ${error.message}`);
}
