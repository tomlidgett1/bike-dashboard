import {
  HEY_COMP_ACKS_TABLE,
  HEY_COMP_PENDING_CONFIRMATIONS_TABLE,
  HEY_COMP_PENDING_RESUME_TASKS_TABLE,
  HEY_COMP_ROUTER_DECISIONS_TABLE,
  HEY_COMP_SMART_RUNS_TABLE,
  LINQ_SEND_FAILURES_TABLE,
} from "../env.ts";
import { getAdminClient } from "../supabase.ts";

function logTableError(table: string, error: { message: string } | null): void {
  if (error) console.warn(`[heycomp:persistence] ${table} write failed:`, error.message);
}

export async function logHeyCompRouterDecision(params: {
  turnId: string;
  chatId: string;
  senderHandle: string | null;
  authUserId: string | null;
  messageText: string;
  mode: "chat" | "smart";
  reason: string;
  model: string;
  latencyMs: number;
  promptSource: "file" | "fallback" | "compiled_ts";
}): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.from(HEY_COMP_ROUTER_DECISIONS_TABLE).insert({
    turn_id: params.turnId,
    chat_id: params.chatId,
    sender_handle: params.senderHandle,
    auth_user_id: params.authUserId,
    message_text: params.messageText,
    mode: params.mode,
    reason: params.reason,
    model: params.model,
    latency_ms: params.latencyMs,
    prompt_source: params.promptSource,
  });
  logTableError(HEY_COMP_ROUTER_DECISIONS_TABLE, error);
}

export async function logHeyCompAck(params: {
  turnId: string;
  chatId: string;
  senderHandle: string | null;
  kind: "initial" | "followup" | "connection_link" | "confirmation_prompt" | "trigger_notification";
  text: string;
  status: "sent" | "failed" | "skipped";
  latencyMs?: number | null;
  metadata?: Record<string, unknown>;
  error?: string | null;
}): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.from(HEY_COMP_ACKS_TABLE).insert({
    turn_id: params.turnId,
    chat_id: params.chatId,
    sender_handle: params.senderHandle,
    kind: params.kind,
    text: params.text,
    status: params.status,
    latency_ms: params.latencyMs ?? null,
    metadata: params.metadata ?? {},
    error: params.error ?? null,
  });
  logTableError(HEY_COMP_ACKS_TABLE, error);
}

export async function logHeyCompSmartRun(params: {
  turnId: string;
  chatId: string;
  senderHandle: string | null;
  authUserId: string | null;
  composioUserId: string | null;
  status: "started" | "completed" | "failed" | "waiting_for_confirmation" | "waiting_for_connection";
  routeReason?: string | null;
  model?: string | null;
  toolPlan?: Record<string, unknown>;
  toolCalls?: Array<Record<string, unknown>>;
  toolResults?: Array<Record<string, unknown>>;
  finalText?: string | null;
  error?: string | null;
  latencyMs?: number | null;
}): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.from(HEY_COMP_SMART_RUNS_TABLE).upsert({
    turn_id: params.turnId,
    chat_id: params.chatId,
    sender_handle: params.senderHandle,
    auth_user_id: params.authUserId,
    composio_user_id: params.composioUserId,
    status: params.status,
    route_reason: params.routeReason ?? null,
    model: params.model ?? null,
    tool_plan: params.toolPlan ?? {},
    tool_calls: params.toolCalls ?? [],
    tool_results: params.toolResults ?? [],
    final_text: params.finalText ?? null,
    error: params.error ?? null,
    latency_ms: params.latencyMs ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "turn_id" });
  logTableError(HEY_COMP_SMART_RUNS_TABLE, error);
}

export interface HeyCompPendingConfirmation {
  id: number;
  chatId: string;
  turnId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  promptText: string;
  status: "awaiting_confirmation" | "completed" | "cancelled" | "expired";
  metadata: Record<string, unknown>;
}

export async function createHeyCompPendingConfirmation(params: {
  turnId: string;
  chatId: string;
  senderHandle: string | null;
  authUserId: string | null;
  toolName: string;
  toolArguments: Record<string, unknown>;
  promptText: string;
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(HEY_COMP_PENDING_CONFIRMATIONS_TABLE)
    .insert({
      turn_id: params.turnId,
      chat_id: params.chatId,
      sender_handle: params.senderHandle,
      auth_user_id: params.authUserId,
      tool_name: params.toolName,
      tool_arguments: params.toolArguments,
      prompt_text: params.promptText,
      status: "awaiting_confirmation",
      metadata: params.metadata ?? {},
    })
    .select("id")
    .maybeSingle<{ id: number }>();
  logTableError(HEY_COMP_PENDING_CONFIRMATIONS_TABLE, error);
  return data?.id ?? null;
}

export async function getLatestHeyCompPendingConfirmation(
  chatId: string,
): Promise<HeyCompPendingConfirmation | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(HEY_COMP_PENDING_CONFIRMATIONS_TABLE)
    .select("id, chat_id, turn_id, tool_name, tool_arguments, prompt_text, status, metadata")
    .eq("chat_id", chatId)
    .eq("status", "awaiting_confirmation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    chatId: data.chat_id,
    turnId: data.turn_id,
    toolName: data.tool_name,
    toolArguments: (data.tool_arguments as Record<string, unknown> | null) ?? {},
    promptText: data.prompt_text,
    status: data.status,
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
  };
}

export async function markHeyCompPendingConfirmation(
  id: number,
  status: "completed" | "cancelled" | "expired",
): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(HEY_COMP_PENDING_CONFIRMATIONS_TABLE)
    .update({
      status,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  logTableError(HEY_COMP_PENDING_CONFIRMATIONS_TABLE, error);
}

export async function createHeyCompPendingResumeTask(params: {
  turnId: string;
  chatId: string;
  senderHandle: string | null;
  authUserId: string | null;
  composioUserId: string;
  userText: string;
  missingToolkits: string[];
  connectionUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.from(HEY_COMP_PENDING_RESUME_TASKS_TABLE).insert({
    turn_id: params.turnId,
    chat_id: params.chatId,
    sender_handle: params.senderHandle,
    auth_user_id: params.authUserId,
    composio_user_id: params.composioUserId,
    user_text: params.userText,
    missing_toolkits: params.missingToolkits,
    connection_url: params.connectionUrl,
    status: "awaiting_connection",
    metadata: params.metadata ?? {},
  });
  logTableError(HEY_COMP_PENDING_RESUME_TASKS_TABLE, error);
}

export async function invalidatePendingResumeTasksForToolkit(args: {
  composioUserId: string | null;
  toolkit: string | null;
}): Promise<void> {
  if (!args.composioUserId || !args.toolkit) return;
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(HEY_COMP_PENDING_RESUME_TASKS_TABLE)
    .update({
      status: "connection_expired",
      updated_at: new Date().toISOString(),
    })
    .eq("composio_user_id", args.composioUserId)
    .contains("missing_toolkits", [args.toolkit.toLowerCase()]);
  logTableError(HEY_COMP_PENDING_RESUME_TASKS_TABLE, error);
}

export interface HeyCompPendingResumeTask {
  id: number;
  turnId: string;
  chatId: string;
  senderHandle: string | null;
  authUserId: string | null;
  composioUserId: string;
  userText: string;
  missingToolkits: string[];
}

export async function getPendingResumeTasksForToolkit(args: {
  composioUserId: string;
  toolkit: string;
  limit?: number;
}): Promise<HeyCompPendingResumeTask[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(HEY_COMP_PENDING_RESUME_TASKS_TABLE)
    .select("id, turn_id, chat_id, sender_handle, auth_user_id, composio_user_id, user_text, missing_toolkits")
    .eq("composio_user_id", args.composioUserId)
    .eq("status", "awaiting_connection")
    .contains("missing_toolkits", [args.toolkit.toLowerCase()])
    .order("created_at", { ascending: true })
    .limit(args.limit ?? 3);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    turnId: row.turn_id,
    chatId: row.chat_id,
    senderHandle: row.sender_handle ?? null,
    authUserId: row.auth_user_id ?? null,
    composioUserId: row.composio_user_id,
    userText: row.user_text,
    missingToolkits: Array.isArray(row.missing_toolkits) ? row.missing_toolkits : [],
  }));
}

export async function markPendingResumeTaskResumed(id: number): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(HEY_COMP_PENDING_RESUME_TASKS_TABLE)
    .update({
      status: "resumed",
      resumed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  logTableError(HEY_COMP_PENDING_RESUME_TASKS_TABLE, error);
}

export async function logLinqSendFailure(params: {
  chatId: string | null;
  purpose: string;
  text: string;
  error: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.from(LINQ_SEND_FAILURES_TABLE).insert({
    chat_id: params.chatId,
    purpose: params.purpose,
    text: params.text,
    error: params.error,
    metadata: params.metadata ?? {},
  });
  logTableError(LINQ_SEND_FAILURES_TABLE, error);
}
