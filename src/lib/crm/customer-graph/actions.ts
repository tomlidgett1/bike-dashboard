import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDomestiqueConfig } from "@/lib/domestique/config";
import { executeOpportunity } from "@/lib/domestique/execute";
import type { DomestiqueOpportunity } from "@/lib/types/domestique";
import {
  executeLifecycleAction,
} from "@/lib/crm/lifecycle/execute";
import {
  AGENT_ACTION_KINDS,
  classifyAgentRisk,
  type AgentActionIntent,
  type AgentActionKind,
} from "../agent-policy";
import type {
  ActionDecision,
  ActionMutationResponse,
  AgentAction,
  AgentActionSource,
  AgentActionStatus,
  AgentRiskTier,
  ConsentChannel,
  JsonValue,
  TaskPriority,
  TaskStatus,
  TodayItem,
} from "./types";
import { CrmRepositoryError } from "./repository";

const SNOOZE_PREFIX = "CRM snoozed until ";

type MutateActionInput = {
  source: AgentActionSource;
  sourceId: string;
  decision: ActionDecision;
  snoozeUntil: string | null;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function taskStatus(value: unknown): TaskStatus {
  return ["open", "in_progress", "completed", "dismissed", "snoozed", "cancelled"].includes(
    String(value),
  )
    ? (value as TaskStatus)
    : "open";
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

function jsonRecord(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function mapAgentAction(row: Record<string, unknown>): AgentAction {
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

function knownActionKind(value: unknown): AgentActionKind | null {
  return AGENT_ACTION_KINDS.includes(value as AgentActionKind)
    ? (value as AgentActionKind)
    : null;
}

function todayMutationItem(
  source: AgentActionSource,
  sourceId: string,
  row: Record<string, unknown>,
  status: AgentActionStatus | TaskStatus,
  risk: AgentRiskTier,
): TodayItem {
  return {
    id: `${source}:${sourceId}`,
    source,
    sourceId,
    customerId: stringOrNull(row.customer_id),
    customerName: null,
    title: String(row.title ?? row.subject ?? "CRM action"),
    summary: stringOrNull(row.summary ?? row.reasoning),
    priority: taskPriority(row.priority),
    status,
    riskTier: risk,
    dueAt: stringOrNull(row.due_at ?? row.expires_at),
    createdAt: String(row.created_at ?? ""),
    availableDecisions: [],
  };
}

export function statusDetailSnoozeUntil(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(SNOOZE_PREFIX)) return null;
  const timestamp = value.slice(SNOOZE_PREFIX.length);
  return Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null;
}

function snoozeStatusDetail(until: string): string {
  return `${SNOOZE_PREFIX}${until}`;
}

async function mutateTask(
  supabase: SupabaseClient,
  storeId: string,
  input: MutateActionInput,
): Promise<ActionMutationResponse> {
  const patch: Record<string, unknown> =
    input.decision === "approve"
      ? { status: "completed", completed_at: new Date().toISOString(), snoozed_until: null }
      : input.decision === "dismiss"
        ? { status: "dismissed", snoozed_until: null }
        : { status: "snoozed", snoozed_until: input.snoozeUntil };
  const result = await supabase
    .from("store_customer_tasks")
    .update(patch)
    .eq("store_id", storeId)
    .eq("id", input.sourceId)
    .in("status", ["open", "in_progress", "snoozed"])
    .select("*")
    .maybeSingle();
  if (result.error) throw new CrmRepositoryError(result.error.message, "mutate_task");
  if (!result.data) throw new CrmRepositoryError("Task is no longer available.", "action_conflict");
  const row = result.data as Record<string, unknown>;
  return {
    action: todayMutationItem("task", input.sourceId, row, taskStatus(row.status), "low"),
    executed: input.decision === "approve",
  };
}

async function mutateAgentAction(
  supabase: SupabaseClient,
  storeId: string,
  actorUserId: string,
  input: MutateActionInput,
): Promise<ActionMutationResponse> {
  const current = await supabase
    .from("store_agent_actions")
    .select("*")
    .eq("store_id", storeId)
    .eq("id", input.sourceId)
    .in("status", ["draft", "awaiting_approval", "approved", "snoozed"])
    .maybeSingle();
  if (current.error) throw new CrmRepositoryError(current.error.message, "load_agent_action");
  if (!current.data) {
    throw new CrmRepositoryError("Action is no longer available.", "action_conflict");
  }
  const row = current.data as Record<string, unknown>;
  const kind = knownActionKind(row.action_type);
  const intent: AgentActionIntent = {
    kind: kind ?? "publish_campaign",
    external: !kind,
    channel: channel(row.channel),
    customerId: stringOrNull(row.customer_id),
    destructive: riskTier(row.risk_tier) === "restricted",
  };
  const policy = classifyAgentRisk(intent);
  const completed = input.decision === "approve" && policy.mayExecuteAutonomously;
  const patch: Record<string, unknown> =
    input.decision === "approve"
      ? {
          status: completed ? "completed" : "approved",
          approved_at: new Date().toISOString(),
          approved_by: actorUserId,
          executed_at: completed ? new Date().toISOString() : null,
          snoozed_until: null,
          policy_decision: {
            ...jsonRecord(row.policy_decision),
            baseline_tier: policy.baselineTier,
            effective_tier: policy.effectiveTier,
            reason: policy.reason,
            approved_by: actorUserId,
          },
        }
      : input.decision === "dismiss"
        ? {
            status: "dismissed",
            snoozed_until: null,
            policy_decision: {
              decision: "dismissed",
              reason: "Dismissed by store user.",
              actor_user_id: actorUserId,
            },
          }
        : {
            status: "snoozed",
            snoozed_until: input.snoozeUntil,
            policy_decision: {
              decision: "snoozed",
              reason: `Snoozed until ${input.snoozeUntil}.`,
              actor_user_id: actorUserId,
            },
          };
  const updated = await supabase
    .from("store_agent_actions")
    .update(patch)
    .eq("store_id", storeId)
    .eq("id", input.sourceId)
    .in("status", ["draft", "awaiting_approval", "approved", "snoozed"])
    .select("*")
    .maybeSingle();
  if (updated.error) throw new CrmRepositoryError(updated.error.message, "mutate_agent_action");
  if (!updated.data) {
    throw new CrmRepositoryError("Action was updated elsewhere.", "action_conflict");
  }
  const updatedRow = updated.data as Record<string, unknown>;
  const audit = await supabase.from("store_agent_action_audit").insert({
    store_id: storeId,
    action_id: input.sourceId,
    event_type: input.decision,
    actor_user_id: actorUserId,
    from_status: String(row.status ?? ""),
    to_status: String(updatedRow.status ?? ""),
    payload_hash: stringOrNull(row.payload_hash),
    detail: {
      decision: input.decision,
      snooze_until: input.snoozeUntil,
      risk: policy.effectiveTier,
    },
  });
  if (audit.error) {
    throw new CrmRepositoryError(audit.error.message, "audit_agent_action");
  }
  return { action: mapAgentAction(updatedRow), executed: completed };
}

async function mutateLifecycle(
  supabase: SupabaseClient,
  ownerUserId: string,
  input: MutateActionInput,
): Promise<ActionMutationResponse> {
  if (input.decision === "approve") {
    await executeLifecycleAction(supabase, ownerUserId, input.sourceId);
    const result = await supabase
      .from("crm_lifecycle_actions")
      .select("id, subject, reasoning, status, expires_at, created_at")
      .eq("id", input.sourceId)
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (result.error || !result.data) {
      throw new CrmRepositoryError(
        result.error?.message ?? "Lifecycle action was not found after execution.",
        "mutate_lifecycle",
      );
    }
    return {
      action: todayMutationItem(
        "lifecycle",
        input.sourceId,
        result.data as Record<string, unknown>,
        "completed",
        "approval",
      ),
      executed: true,
    };
  }
  if (input.decision === "dismiss") {
    const update = await supabase
      .from("crm_lifecycle_actions")
      .update({ status: "skipped", status_detail: "Dismissed by store user." })
      .eq("id", input.sourceId)
      .eq("user_id", ownerUserId)
      .eq("status", "awaiting_approval")
      .select("id")
      .maybeSingle();
    if (update.error) throw new CrmRepositoryError(update.error.message, "dismiss_lifecycle");
    if (!update.data) {
      throw new CrmRepositoryError("Lifecycle action is no longer pending.", "action_conflict");
    }
  } else {
    const update = await supabase
      .from("crm_lifecycle_actions")
      .update({ status_detail: snoozeStatusDetail(input.snoozeUntil!) })
      .eq("id", input.sourceId)
      .eq("user_id", ownerUserId)
      .eq("status", "awaiting_approval")
      .select("id")
      .maybeSingle();
    if (update.error) throw new CrmRepositoryError(update.error.message, "snooze_lifecycle");
    if (!update.data) {
      throw new CrmRepositoryError("Lifecycle action is no longer pending.", "action_conflict");
    }
  }
  const result = await supabase
    .from("crm_lifecycle_actions")
    .select("id, subject, reasoning, status, status_detail, expires_at, created_at")
    .eq("id", input.sourceId)
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new CrmRepositoryError(
      result.error?.message ?? "Lifecycle action was not found.",
      "mutate_lifecycle",
    );
  }
  return {
    action: todayMutationItem(
      "lifecycle",
      input.sourceId,
      result.data as Record<string, unknown>,
      input.decision === "dismiss" ? "dismissed" : "snoozed",
      "approval",
    ),
    executed: false,
  };
}

async function mutateDomestique(
  supabase: SupabaseClient,
  ownerUserId: string,
  input: MutateActionInput,
): Promise<ActionMutationResponse> {
  const current = await supabase
    .from("domestique_opportunities")
    .select("*")
    .eq("id", input.sourceId)
    .eq("user_id", ownerUserId)
    .eq("status", "proposed")
    .maybeSingle();
  if (current.error) throw new CrmRepositoryError(current.error.message, "load_domestique_action");
  if (!current.data) {
    throw new CrmRepositoryError("Domestique play is no longer pending.", "action_conflict");
  }
  const opportunity = current.data as unknown as DomestiqueOpportunity;
  const financial = (opportunity.action_plan.discounts?.length ?? 0) > 0;
  const policy = classifyAgentRisk({
    kind: financial ? "apply_discount" : "publish_campaign",
    external: true,
  });

  if (input.decision === "approve") {
    const claim = await supabase
      .from("domestique_opportunities")
      .update({
        status: "executing",
        status_detail: policy.reason,
        approved_at: new Date().toISOString(),
      })
      .eq("id", input.sourceId)
      .eq("user_id", ownerUserId)
      .eq("status", "proposed")
      .select("*")
      .maybeSingle();
    if (claim.error) throw new CrmRepositoryError(claim.error.message, "claim_domestique_action");
    if (!claim.data) {
      throw new CrmRepositoryError("Domestique play was updated elsewhere.", "action_conflict");
    }
    const config = await loadDomestiqueConfig(supabase, ownerUserId);
    await executeOpportunity(
      supabase,
      ownerUserId,
      config,
      claim.data as unknown as DomestiqueOpportunity,
    );
  } else {
    const patch =
      input.decision === "dismiss"
        ? { status: "skipped", status_detail: "Dismissed by store user." }
        : { status_detail: snoozeStatusDetail(input.snoozeUntil!) };
    const update = await supabase
      .from("domestique_opportunities")
      .update(patch)
      .eq("id", input.sourceId)
      .eq("user_id", ownerUserId)
      .eq("status", "proposed")
      .select("id")
      .maybeSingle();
    if (update.error) throw new CrmRepositoryError(update.error.message, "mutate_domestique_action");
    if (!update.data) {
      throw new CrmRepositoryError("Domestique play was updated elsewhere.", "action_conflict");
    }
  }

  const result = await supabase
    .from("domestique_opportunities")
    .select("id, title, summary, status, status_detail, expires_at, created_at")
    .eq("id", input.sourceId)
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new CrmRepositoryError(
      result.error?.message ?? "Domestique play was not found.",
      "mutate_domestique_action",
    );
  }
  return {
    action: todayMutationItem(
      "domestique",
      input.sourceId,
      result.data as Record<string, unknown>,
      input.decision === "approve"
        ? "completed"
        : input.decision === "dismiss"
          ? "dismissed"
          : "snoozed",
      financial ? "restricted" : "approval",
    ),
    executed: input.decision === "approve",
  };
}

export async function mutateCrmAction(
  supabase: SupabaseClient,
  storeId: string,
  ownerUserId: string,
  actorUserId: string,
  input: MutateActionInput,
): Promise<ActionMutationResponse> {
  if (input.source === "task") return mutateTask(supabase, storeId, input);
  if (input.source === "agent") return mutateAgentAction(supabase, storeId, actorUserId, input);
  if (input.source === "lifecycle") return mutateLifecycle(supabase, ownerUserId, input);
  if (input.source === "domestique") return mutateDomestique(supabase, ownerUserId, input);
  throw new CrmRepositoryError(
    "Enquiries are opened in the inbox and cannot be actioned from this endpoint.",
    "unsupported_action_source",
  );
}
