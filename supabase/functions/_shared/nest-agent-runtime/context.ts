import { getComposioUserId, getComposioUserIds } from "../composio-tools.ts";
import { getAdminClient } from "../supabase.ts";
import { getConversation, getUserProfile } from "../state.ts";
import { NESTV3_TABLES } from "./constants.ts";
import type { RunNestAgentInput, RuntimeContext } from "./types.ts";
import type { StoredMessage, UserProfile } from "../state.ts";

type PreviousRunForClarification = {
  id?: string | null;
  status?: string | null;
  input_message?: string | null;
  final_response?: string | null;
  planner_output?: Record<string, unknown> | null;
  created_at?: string | null;
};

export function pendingClarificationFromPreviousRun(
  data: PreviousRunForClarification | null | undefined,
  nowMs = Date.now(),
): RuntimeContext["pendingClarification"] {
  if (data?.status !== "clarification_needed" || !data.id || !data.final_response) return null;
  const createdAt = new Date(data.created_at ?? 0).getTime();
  if (!Number.isFinite(createdAt) || nowMs - createdAt > 30 * 60 * 1000) return null;
  const planner = data.planner_output && typeof data.planner_output === "object"
    ? data.planner_output
    : null;
  return {
    runId: String(data.id),
    question: String(data.final_response),
    intent: typeof planner?.intent === "string" ? planner.intent : "Resolve the previous clarification.",
    userMessage: String(data.input_message ?? ""),
    plannerOutput: planner,
  };
}

async function loadPendingClarification(input: RunNestAgentInput): Promise<RuntimeContext["pendingClarification"]> {
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.agentRuns)
    .select("id, status, input_message, final_response, planner_output, created_at")
    .eq("chat_id", input.chatId)
    .eq("sender_handle", input.senderHandle)
    .neq("id", input.runId ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return pendingClarificationFromPreviousRun(data as PreviousRunForClarification | null);
}

async function loadLatestAutomation(input: RunNestAgentInput): Promise<RuntimeContext["latestAutomation"]> {
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.automations)
    .select("id, agent_spec_id, cron_expression, next_run_at, metadata, created_at")
    .eq("chat_id", input.chatId)
    .eq("sender_handle", input.senderHandle)
    .eq("enabled", true)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? data.metadata as Record<string, unknown>
    : {};
  const planner = metadata.planner && typeof metadata.planner === "object" && !Array.isArray(metadata.planner)
    ? metadata.planner as Record<string, unknown>
    : {};
  return {
    id: String(data.id),
    agentSpecId: String(data.agent_spec_id),
    intent: typeof planner.intent === "string" ? planner.intent : "latest automation",
    cronExpression: String(data.cron_expression),
    nextRunAt: String(data.next_run_at),
    metadata,
  };
}

function toRuntimeRecentTurns(messages: StoredMessage[]): RuntimeContext["recentTurns"] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? "").slice(0, 1200),
      ...(message.createdAt ? { createdAt: message.createdAt } : {}),
    }))
    .filter((message) => message.content.trim().length > 0);
}

function toRuntimeUserProfile(profile: UserProfile | null): RuntimeContext["userProfile"] {
  if (!profile) return null;
  return {
    handle: profile.handle,
    name: profile.name,
    facts: profile.facts.slice(0, 30),
    contextProfile: profile.contextProfile as Record<string, unknown> | null,
    genz: profile.genz,
  };
}

export async function buildRuntimeContext(
  runId: string,
  input: RunNestAgentInput,
): Promise<RuntimeContext> {
  const timezone = input.timezone ?? "Australia/Melbourne";
  const [recentTurns, userProfile] = await Promise.all([
    getConversation(input.chatId, 20).then(toRuntimeRecentTurns).catch(() => []),
    getUserProfile(input.senderHandle).then(toRuntimeUserProfile).catch(() => null),
  ]);

  return {
    runId,
    authUserId: input.authUserId ?? null,
    senderHandle: input.senderHandle,
    botNumber: input.botNumber ?? null,
    chatId: input.chatId,
    messageId: input.messageId ?? null,
    timezone,
    composioUserId: getComposioUserId(input.authUserId ?? null, input.senderHandle),
    composioUserIds: getComposioUserIds(input.authUserId ?? null, input.senderHandle),
    recentTurns,
    userProfile,
    agentSpecMarkdown: input.agentSpecMarkdown ?? null,
    resumeContext: input.resumeContext ?? {},
    pendingClarification: await loadPendingClarification(input).catch(() => null),
    latestAutomation: await loadLatestAutomation(input).catch(() => null),
    dryRun: input.dryRun ?? false,
  };
}
