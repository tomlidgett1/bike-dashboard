import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  applyGenieSseEvent,
  createEmptyGenieAssistant,
  type AccumulatedGenieAssistant,
} from "@/lib/genie/accumulate-genie-sse-event";
import { executeGenieAgent } from "@/lib/genie/agent/execute";
import type { ComposioSessionIds, Message } from "@/lib/genie/agent/context";
import type { Supa } from "@/lib/genie/agent/tools";
import type { GenieAssistantJobResult, GenieJobMetadata, GenieModelProfile } from "@/lib/genie/genie-job-types";
import { normalizeGenieModelProfile } from "@/lib/genie/agent/model-profiles";
import { appendRawDebugLog } from "@/lib/genie/analysis-events";
import type { GenieRawDebugLogEntry } from "@/lib/genie/genie-job-types";
import { reflectAndStoreLessons } from "@/lib/genie/lesson-reflection";

export type RunGenieAgentJobParams = {
  jobId: string;
  /** Request-scoped, RLS-bound Supabase client for the authenticated store user. */
  supabase: Supa;
  userId: string;
  storeName: string;
  conversationId?: string | null;
  composioSessionIds?: Record<string, string>;
  messages: Message[];
  /**
   * Live tee: receives every agent event as it happens (for direct SSE streaming
   * to the client). Job-row persistence below is the durable fallback path.
   */
  onEvent?: (event: Record<string, unknown>) => void;
};

async function updateJob(jobId: string, patch: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  await supabase
    .from("genie_background_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function syncCompletedConversation(
  conversationId: string | null | undefined,
  userMessages: Record<string, unknown>[],
  assistant: AccumulatedGenieAssistant,
) {
  if (!conversationId) return;

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("genie_conversations")
    .update({
      messages: [...userMessages, assistant],
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) {
    console.error("[runGenieAgentJob] failed to sync conversation", conversationId, error);
  }
}

async function isJobCancelled(jobId: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("genie_background_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  return data?.status === "cancelled";
}

function progressMessage(event: Record<string, unknown>) {
  const text = String(event.text ?? "").trim();
  if (text) return text.slice(0, 240);
  if (event.event === "heartbeat") return "Still working…";
  return "Working…";
}

const CANCEL_CHECK_INTERVAL_MS = 2000;
const PROGRESS_PERSIST_INTERVAL_MS = 1500;
const RESULT_PERSIST_INTERVAL_MS = 700;

const PARTIAL_RESULT_EVENTS = new Set([
  "text_delta",
  "chart",
  "table",
  "pivot_table",
  "products",
  "web_images",
  "workorders",
  "customer_profile",
  "gmail_emails",
  "gmail_agent_context",
  "gmail_connect",
  "proposal",
  "analysis_plan",
  "analysis_query",
  "reasoning_done",
  "sources",
]);

/**
 * Runs the Genie agent in-process for a background job: no HTTP loopback, no
 * cookie forwarding. The caller owns request lifetime (wrap the returned promise
 * in `after()` so a client disconnect does not kill the run).
 */
export async function runGenieAgentJob(params: RunGenieAgentJobParams) {
  await updateJob(params.jobId, {
    status: "running",
    started_at: new Date().toISOString(),
    message: "Thinking",
    progress_phase: "setup",
  });

  let assistant = createEmptyGenieAssistant();
  let stepIndex = 0;
  let lastPersistAt = 0;
  let lastResultPersistAt = 0;
  let jobWriteQueue: Promise<void> = Promise.resolve();
  let cancelled = false;

  const abortController = new AbortController();

  const queueJobUpdate = (patch: Record<string, unknown>) => {
    jobWriteQueue = jobWriteQueue
      .catch(() => undefined)
      .then(() => updateJob(params.jobId, patch))
      .catch((error) => {
        console.error("[runGenieAgentJob] queued job update failed", params.jobId, error);
      });
  };

  const flushJobUpdates = async () => {
    await jobWriteQueue.catch(() => undefined);
  };

  const cancelWatcher = setInterval(() => {
    void isJobCancelled(params.jobId).then((isCancelled) => {
      if (!isCancelled) return;
      cancelled = true;
      abortController.abort();
      clearInterval(cancelWatcher);
    });
  }, CANCEL_CHECK_INTERVAL_MS);

  let metadata: GenieJobMetadata = {};
  // Self-learning signals collected from the live event stream for post-run reflection.
  const sqlErrors: Array<{ purpose: string; error: string }> = [];
  const recheckNotes: string[] = [];
  try {
    const supabaseService = createServiceRoleClient();
    const { data: existing } = await supabaseService
      .from("genie_background_jobs")
      .select("metadata")
      .eq("id", params.jobId)
      .maybeSingle();
    metadata = (existing?.metadata as GenieJobMetadata | null) ?? {};
  } catch {
    // Metadata enrichment is best-effort.
  }

  const handleEvent = (event: Record<string, unknown>) => {
    params.onEvent?.(event);

    // Collect learning signals: SQL queries that errored, and the agent's own
    // recheck self-diagnosis. Distilled into lessons after the run completes.
    if (event.event === "analysis_query") {
      const query = event.query as { status?: string; error?: string; purpose?: string } | undefined;
      if (query?.status === "error" && query.error) {
        sqlErrors.push({ purpose: query.purpose ?? "", error: query.error });
      }
    } else if (event.event === "reasoning_done") {
      const text = String(event.text ?? "").trim();
      if (/^recheck:/i.test(text)) recheckNotes.push(text);
    }

    if (event.event !== "heartbeat") {
      const existing = metadata.raw_debug_logs ?? [];
      metadata = {
        ...metadata,
        raw_debug_logs: appendRawDebugLog(existing, event) as GenieRawDebugLogEntry[],
      };
    }

    assistant = applyGenieSseEvent(event, assistant);

    if (PARTIAL_RESULT_EVENTS.has(String(event.event))) {
      const ts = Date.now();
      if (ts - lastResultPersistAt >= RESULT_PERSIST_INTERVAL_MS) {
        lastResultPersistAt = ts;
        const result: GenieAssistantJobResult = { assistantMessage: assistant };
        queueJobUpdate({ result, metadata });
      }
    }

    if (event.event === "status" || event.event === "heartbeat") {
      stepIndex += 1;
      metadata = { ...metadata, step_index: stepIndex };
      const ts = Date.now();
      if (ts - lastPersistAt >= PROGRESS_PERSIST_INTERVAL_MS) {
        lastPersistAt = ts;
        queueJobUpdate({
          message: progressMessage(event),
          progress_phase: typeof event.phase === "string" ? event.phase : "thinking",
          metadata,
        });
      }
    }

    if (event.event === "composio_session") {
      const toolkit = typeof event.toolkit === "string" ? event.toolkit : "";
      const sessionId = typeof event.session_id === "string" ? event.session_id : "";
      if (toolkit && sessionId) {
        metadata = {
          ...metadata,
          composio_session_ids: {
            ...(metadata.composio_session_ids ?? {}),
            [toolkit]: sessionId,
          },
        };
        queueJobUpdate({ metadata });
      }
    }
  };

  try {
    await executeGenieAgent({
      supabase: params.supabase,
      userId: params.userId,
      storeName: params.storeName,
      messages: params.messages,
      conversationId: params.conversationId ?? null,
      composioSessionIds: (params.composioSessionIds ?? {}) as ComposioSessionIds,
      modelProfile: normalizeGenieModelProfile(metadata.model_profile),
      deepResearch: metadata.mode === "deep_research",
      emit: (data: object) => handleEvent(data as Record<string, unknown>),
      signal: abortController.signal,
    });

    clearInterval(cancelWatcher);
    await flushJobUpdates();

    if (cancelled) {
      // The cancel endpoint already marked the job; leave its status alone.
      return;
    }

    const completedAt = new Date().toISOString();
    const result: GenieAssistantJobResult = { assistantMessage: assistant };

    if (assistant.error) {
      await updateJob(params.jobId, {
        status: "failed",
        error_message: assistant.error,
        result,
        completed_at: completedAt,
        message: "Failed",
        progress_phase: "error",
        metadata,
      });
      return;
    }

    if (metadata.model_profile !== "nano") {
      await syncCompletedConversation(
        params.conversationId,
        params.messages as unknown as Record<string, unknown>[],
        assistant,
      );
    }

    await updateJob(params.jobId, {
      status: "completed",
      result,
      completed_at: completedAt,
      message: "Complete",
      progress_phase: "done",
      metadata,
    });

    // Self-learning: reflect on any mistakes this run recovered from and store
    // durable lessons. Best-effort, awaited (the caller keeps us alive via
    // after()), and gated to real runs with actual signals.
    if (metadata.model_profile !== "nano" && (sqlErrors.length > 0 || recheckNotes.length > 0)) {
      const question =
        [...params.messages].reverse().find((message) => message.role === "user")?.content ?? "";
      try {
        await reflectAndStoreLessons({
          userId: params.userId,
          storeName: params.storeName,
          question,
          answer: assistant.content,
          signals: { sqlErrors, recheckNotes },
        });
      } catch (error) {
        console.error("[runGenieAgentJob] reflection failed", params.jobId, error);
      }
    }
  } catch (error) {
    clearInterval(cancelWatcher);
    await flushJobUpdates();

    if (cancelled) return;

    await updateJob(params.jobId, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Background Genie job failed",
      completed_at: new Date().toISOString(),
      message: "Failed",
      progress_phase: "error",
    });
  }
}
