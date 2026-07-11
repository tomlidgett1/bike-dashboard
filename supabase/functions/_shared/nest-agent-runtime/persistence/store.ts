import { getAdminClient } from "../../supabase.ts";
import { NESTV3_TABLES } from "../constants.ts";
import type { NestAgentRunSource, NestAgentRunStatus, RunNestAgentInput } from "../types.ts";

type JsonRecord = Record<string, unknown>;

export interface StepInsert {
  runId: string;
  sequence?: number;
  phase: string;
  stepType?: string;
  status?: "queued" | "running" | "completed" | "failed" | "blocked" | "skipped";
  toolName?: string | null;
  capability?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  payload?: JsonRecord;
  error?: string | null;
}

let sequenceCache = new Map<string, number>();

function redactRuntimeText(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value
    .replace(/Invalid API key:\s*[^"',\s}]+/gi, "Invalid API key: [REDACTED]")
    .replace(/(api[_-]?key|authorization|bearer|token|secret)["':=\s]+[^"',\s}]+/gi, "$1=[REDACTED]");
}

function nextSequence(runId: string): number {
  const next = (sequenceCache.get(runId) ?? 0) + 1;
  sequenceCache.set(runId, next);
  return next;
}

export function clearRunSequenceCache(runId: string): void {
  sequenceCache.delete(runId);
}

export async function createAgentRun(input: RunNestAgentInput): Promise<string> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(NESTV3_TABLES.agentRuns)
    .insert({
      source: input.source ?? "linq_inbound",
      trigger_type: input.triggerType ?? "inbound",
      status: "queued",
      auth_user_id: input.authUserId ?? null,
      sender_handle: input.senderHandle,
      bot_number: input.botNumber ?? null,
      chat_id: input.chatId,
      message_id: input.messageId ?? null,
      timezone: input.timezone ?? null,
      input_message: input.userMessage,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create NESTV3_agent_runs row: ${error?.message ?? "missing id"}`);
  }

  return String(data.id);
}

export async function updateAgentRun(
  runId: string,
  patch: {
    status?: NestAgentRunStatus;
    source?: NestAgentRunSource;
    finalResponse?: string | null;
    plannerOutput?: JsonRecord | null;
    verifierStatus?: string | null;
    requiredCapabilities?: string[];
    requiredApps?: string[];
    error?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    metadata?: JsonRecord;
  },
): Promise<void> {
  const update: JsonRecord = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.source !== undefined) update.source = patch.source;
  if (patch.finalResponse !== undefined) update.final_response = patch.finalResponse;
  if (patch.plannerOutput !== undefined) update.planner_output = patch.plannerOutput;
  if (patch.verifierStatus !== undefined) update.verifier_status = patch.verifierStatus;
  if (patch.requiredCapabilities !== undefined) update.required_capabilities = patch.requiredCapabilities;
  if (patch.requiredApps !== undefined) update.required_apps = patch.requiredApps;
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.startedAt !== undefined) update.started_at = patch.startedAt;
  if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;
  if (patch.metadata !== undefined) update.metadata = patch.metadata;

  const { error } = await getAdminClient()
    .from(NESTV3_TABLES.agentRuns)
    .update(update)
    .eq("id", runId);

  if (error) throw new Error(`Failed to update NESTV3_agent_runs: ${error.message}`);
}

export async function addRunStep(step: StepInsert): Promise<string> {
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.agentRunSteps)
    .insert({
      run_id: step.runId,
      sequence: step.sequence ?? nextSequence(step.runId),
      phase: step.phase,
      step_type: step.stepType ?? "event",
      status: step.status ?? "running",
      tool_name: step.toolName ?? null,
      capability: step.capability ?? null,
      input_summary: step.inputSummary ?? null,
      output_summary: step.outputSummary ?? null,
      payload: step.payload ?? {},
      error: redactRuntimeText(step.error),
      completed_at: step.status && ["completed", "failed", "blocked", "skipped"].includes(step.status)
        ? new Date().toISOString()
        : null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to insert NESTV3_agent_run_steps: ${error?.message ?? "missing id"}`);
  }
  return String(data.id);
}

export async function completeRunStep(
  stepId: string,
  patch: {
    status?: "completed" | "failed" | "blocked" | "skipped";
    outputSummary?: string | null;
    payload?: JsonRecord;
    error?: string | null;
  },
): Promise<void> {
  const { error } = await getAdminClient()
    .from(NESTV3_TABLES.agentRunSteps)
    .update({
      status: patch.status ?? "completed",
      output_summary: redactRuntimeText(patch.outputSummary),
      payload: patch.payload ?? {},
      error: redactRuntimeText(patch.error),
      completed_at: new Date().toISOString(),
    })
    .eq("id", stepId);

  if (error) throw new Error(`Failed to update NESTV3_agent_run_steps: ${error.message}`);
}

export async function addArtifact(args: {
  runId: string;
  artifactType: string;
  revision?: number;
  title?: string | null;
  contentText?: string | null;
  payload?: JsonRecord;
  metadata?: JsonRecord;
}): Promise<{ id: string; revision: number }> {
  const revision = args.revision ?? 1;
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.agentArtifacts)
    .upsert(
      {
        run_id: args.runId,
        artifact_type: args.artifactType,
        revision,
        title: args.title ?? null,
        content_text: args.contentText ?? null,
        payload: args.payload ?? {},
        metadata: args.metadata ?? {},
        redacted: true,
      },
      { onConflict: "run_id,artifact_type,revision" },
    )
    .select("id, revision")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to upsert NESTV3_agent_artifacts: ${error?.message ?? "missing id"}`);
  }
  return { id: String(data.id), revision: Number(data.revision ?? revision) };
}

export async function appendDebugEvent(args: {
  runId: string;
  phase: string;
  summary: string;
  payload?: JsonRecord;
}): Promise<void> {
  const { error } = await getAdminClient()
    .from(NESTV3_TABLES.runtimeDebugEvents)
    .insert({
      run_id: args.runId,
      phase: args.phase,
      summary: args.summary,
      payload: args.payload ?? {},
    });
  if (error) console.warn(`[NESTV3] debug event failed: ${error.message}`);
}
