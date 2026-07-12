import { NextRequest, NextResponse } from "next/server";
import {
  UUID_PATTERN,
  crmApiError,
  crmRouteError,
  requireCrmContext,
} from "@/lib/crm/customer-graph/http";
import { mutateCrmAction } from "@/lib/crm/customer-graph/actions";
import { parseActionReference } from "@/lib/crm/customer-graph/repository";
import { executeStoreAgentAction } from "@/lib/crm/agent-action-executor";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ActionDecision,
  AgentActionSource,
} from "@/lib/crm/customer-graph/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DECISIONS: ActionDecision[] = ["approve", "dismiss", "snooze"];
const SOURCES: AgentActionSource[] = [
  "agent",
  "task",
  "lifecycle",
  "domestique",
  "enquiry",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return crmApiError("INVALID_REQUEST", "Request body must be an object.", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return crmApiError("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }

  const decision = String(body.decision ?? body.action ?? "");
  if (!DECISIONS.includes(decision as ActionDecision)) {
    return crmApiError(
      "INVALID_REQUEST",
      "action must be approve, dismiss or snooze.",
      400,
    );
  }
  const sourceHint =
    typeof body.source === "string" && SOURCES.includes(body.source as AgentActionSource)
      ? (body.source as AgentActionSource)
      : undefined;
  const reference = parseActionReference(id, sourceHint);
  if (!reference || !UUID_PATTERN.test(reference.sourceId)) {
    return crmApiError(
      "INVALID_REQUEST",
      "Action id must include a valid source and UUID.",
      400,
    );
  }

  let snoozeUntil: string | null = null;
  if (decision === "snooze") {
    const requested =
      typeof body.snoozeUntil === "string" ? Date.parse(body.snoozeUntil) : Number.NaN;
    if (!Number.isFinite(requested)) {
      return crmApiError(
        "INVALID_REQUEST",
        "snoozeUntil must be a valid future date.",
        400,
      );
    }
    const now = Date.now();
    if (requested <= now || requested > now + 365 * 86_400_000) {
      return crmApiError(
        "INVALID_REQUEST",
        "snoozeUntil must be within the next 365 days.",
        400,
      );
    }
    snoozeUntil = new Date(requested).toISOString();
  }

  const resolved = await requireCrmContext();
  if ("error" in resolved) return resolved.error;
  if (resolved.context.role !== "owner" && resolved.context.role !== "manager") {
    return crmApiError(
      "APPROVAL_REQUIRED",
      "Only a store owner or manager can approve, dismiss or snooze governed actions.",
      403,
    );
  }

  try {
    const admin = createServiceRoleClient();
    const result = await mutateCrmAction(
      admin,
      resolved.context.storeId,
      resolved.context.ownerUserId,
      resolved.context.userId,
      {
        source: reference.source,
        sourceId: reference.sourceId,
        decision: decision as ActionDecision,
        snoozeUntil,
      },
    );
    if (
      reference.source === "agent"
      && decision === "approve"
      && !result.executed
    ) {
      const execution = await executeStoreAgentAction({
        supabase: admin,
        userId: resolved.context.ownerUserId,
        actorUserId: resolved.context.userId,
        actionId: reference.sourceId,
      });
      return NextResponse.json({ ...result, executed: true, execution });
    }
    return NextResponse.json(result);
  } catch (error) {
    return crmRouteError(error, "actions");
  }
}
