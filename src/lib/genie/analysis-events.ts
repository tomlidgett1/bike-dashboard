import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieRawDebugLogEntry,
} from "@/lib/types/genie-agent";

const RAW_DEBUG_LOG_LIMIT = 2000;

export function mergeAnalysisPlan(
  existing: GenieAnalysisPlanPayload | undefined,
  incoming: GenieAnalysisPlanPayload,
): GenieAnalysisPlanPayload {
  if (!existing || incoming.source === "planner") return incoming;
  return {
    ...existing,
    execution_steps: [...existing.execution_steps, ...incoming.execution_steps],
    user_intent: incoming.user_intent ?? existing.user_intent,
  };
}

export function appendRawDebugLog(
  existing: GenieRawDebugLogEntry[] | undefined,
  payload: Record<string, unknown>,
): GenieRawDebugLogEntry[] {
  const nextSeq = (existing?.[existing.length - 1]?.seq ?? 0) + 1;
  return [
    ...(existing ?? []),
    {
      seq: nextSeq,
      at: new Date().toISOString(),
      payload,
    },
  ].slice(-RAW_DEBUG_LOG_LIMIT);
}

export function upsertAnalysisQuery(
  existing: GenieAnalysisQueryPayload[] | undefined,
  incoming: GenieAnalysisQueryPayload,
): GenieAnalysisQueryPayload[] {
  const current = existing ?? [];
  const index = current.findIndex((query) => query.id === incoming.id);
  if (index >= 0) {
    const next = [...current];
    next[index] = { ...next[index], ...incoming };
    return next.slice(-24);
  }
  return [...current, incoming].slice(-24);
}
