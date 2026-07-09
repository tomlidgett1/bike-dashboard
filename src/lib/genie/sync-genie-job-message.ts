import type { GenieAssistantJobResult, GenieJob } from "@/lib/genie/genie-job-types";

export function isGenieJobRunning(job: GenieJob) {
  return job.status === "queued" || job.status === "running";
}

export function activeJobsForConversation(
  jobs: GenieJob[],
  conversationId: string,
  source?: string,
): GenieJob[] {
  return jobs.filter(
    (job) =>
      job.conversationId === conversationId &&
      isGenieJobRunning(job) &&
      (!source || job.metadata.source === source),
  );
}

export function latestJobForConversation(
  jobs: GenieJob[],
  conversationId: string,
  source?: string,
): GenieJob | null {
  const matches = jobs.filter(
    (job) =>
      job.conversationId === conversationId &&
      (!source || job.metadata.source === source),
  );
  if (matches.length === 0) return null;
  return matches.sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )[0];
}

type ResumableMessage = {
  id: string;
  role: string;
  content?: string;
};

export function ensureAssistantMessageForJob<T extends ResumableMessage>(
  messages: T[],
  job: GenieJob,
): T[] {
  const assistantId = job.metadata.client_assistant_id?.trim();
  if (!assistantId) return messages;

  if (messages.some((message) => message.id === assistantId)) {
    return messages;
  }

  const prompt = job.prompt.trim();
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user") continue;
    lastUserIndex = index;
    break;
  }

  if (lastUserIndex >= 0) {
    const lastUserText = String(messages[lastUserIndex]?.content ?? "").trim();
    if (prompt && lastUserText && prompt !== lastUserText && !prompt.endsWith(lastUserText)) {
      return messages;
    }
  }

  const assistantMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
  } as T;

  if (lastUserIndex >= 0) {
    const next = [...messages];
    if (next[lastUserIndex + 1]?.role === "assistant") {
      next[lastUserIndex + 1] = { ...next[lastUserIndex + 1], id: assistantId };
      return next;
    }
    next.splice(lastUserIndex + 1, 0, assistantMessage);
    return next;
  }

  return [...messages, assistantMessage];
}

function assistantContentLength(job: GenieJob): number {
  const content = job.result?.assistantMessage?.content;
  return typeof content === "string" ? content.length : 0;
}

const ASSISTANT_ARRAY_KEYS = [
  "charts",
  "tables",
  "pivotTables",
  "products",
  "webImages",
  "proposals",
  "analysisQueries",
  "suggestedPrompts",
] as const;

function mergeAssistantPayload<T extends object>(
  base: T,
  incoming: Record<string, unknown> | null | undefined,
): T {
  if (!incoming) return base;

  const merged = { ...base, ...incoming } as T & { content?: string };
  const baseContent =
    typeof (base as { content?: unknown }).content === "string"
      ? (base as { content: string }).content
      : "";
  const incomingContent =
    typeof incoming.content === "string" ? incoming.content : "";

  if (baseContent.length > incomingContent.length) {
    merged.content = baseContent;
  }

  const baseRecord = base as Record<string, unknown>;
  const mergedRecord = merged as Record<string, unknown>;
  for (const key of ASSISTANT_ARRAY_KEYS) {
    const baseItems = Array.isArray(baseRecord[key]) ? baseRecord[key] : [];
    const incomingItems = Array.isArray(incoming[key]) ? incoming[key] : [];
    if (baseItems.length > 0 || incomingItems.length > 0) {
      mergedRecord[key] =
        baseItems.length > incomingItems.length ? baseItems : incomingItems;
    }
  }

  return merged;
}

/**
 * Merges a polled job snapshot into the local copy without regressing a finished
 * stream or overwriting richer in-flight assistant text with a staler DB partial.
 */
export function mergeGenieJobSnapshots(local: GenieJob, incoming: GenieJob): GenieJob {
  const localActive = isGenieJobRunning(local);
  const incomingActive = isGenieJobRunning(incoming);

  // Stream already finished locally; ignore a still-running poll from the DB.
  if (incomingActive && !localActive) {
    return local;
  }

  const localLen = assistantContentLength(local);
  const incomingLen = assistantContentLength(incoming);

  if (localLen > incomingLen) {
    return {
      ...incoming,
      status: localActive && !incomingActive ? incoming.status : local.status,
      message: local.message ?? incoming.message,
      progressPhase: local.progressPhase ?? incoming.progressPhase,
      errorMessage: local.errorMessage ?? incoming.errorMessage,
      result: local.result ?? incoming.result,
      completedAt: local.completedAt ?? incoming.completedAt,
      metadata: {
        ...incoming.metadata,
        raw_debug_logs:
          (local.metadata.raw_debug_logs?.length ?? 0) >=
          (incoming.metadata.raw_debug_logs?.length ?? 0)
            ? local.metadata.raw_debug_logs
            : incoming.metadata.raw_debug_logs,
      },
    };
  }

  return incoming;
}

export function mergeGenieJobIntoAssistantMessage<T extends object>(message: T, job: GenieJob): T {
  if (isGenieJobRunning(job)) {
    const progressText = job.message ?? "Thinking";
    const progressPhase = job.progressPhase ?? "thinking";
    const partial = job.result?.assistantMessage as Record<string, unknown> | undefined;
    const base = mergeAssistantPayload(message, partial);

    return {
      ...base,
      isStreaming: true,
      status: progressText,
      statusPhase: progressPhase,
      currentStatus: { phase: progressPhase, text: progressText },
      backgroundJobId: job.id,
      error: undefined,
    } as T;
  }

  if (job.status === "completed" && job.result?.assistantMessage) {
    const payload = job.result.assistantMessage as Record<string, unknown>;
    const base = mergeAssistantPayload(
      {
        ...message,
        isStreaming: false,
        status: undefined,
        statusPhase: undefined,
        currentStatus: undefined,
        backgroundJobId: job.id,
        error: undefined,
      },
      payload,
    );

    return base as T;
  }

  if (job.status === "failed") {
    return {
      ...message,
      isStreaming: false,
      status: undefined,
      statusPhase: undefined,
      currentStatus: undefined,
      backgroundJobId: job.id,
      error: job.errorMessage ?? "Something went wrong. Please try again.",
    } as T;
  }

  if (job.status === "cancelled") {
    const partial = job.result?.assistantMessage as Record<string, unknown> | undefined;
    const base = mergeAssistantPayload(
      {
        ...message,
        isStreaming: false,
        status: undefined,
        statusPhase: undefined,
        currentStatus: undefined,
        backgroundJobId: job.id,
        error: undefined,
      },
      partial,
    );
    return base as T;
  }

  return message;
}

export function pickRicherAssistantResult(
  left: GenieAssistantJobResult | null | undefined,
  right: GenieAssistantJobResult | null | undefined,
): GenieAssistantJobResult | null {
  const leftLen =
    typeof left?.assistantMessage?.content === "string"
      ? left.assistantMessage.content.length
      : 0;
  const rightLen =
    typeof right?.assistantMessage?.content === "string"
      ? right.assistantMessage.content.length
      : 0;
  if (rightLen > leftLen) return right ?? null;
  return left ?? right ?? null;
}
