import { createServiceRoleClient } from "@/lib/supabase/server";
import { readSSE } from "@/lib/optimize/read-sse";
import {
  applyGenieSseEvent,
  createEmptyGenieAssistant,
  type AccumulatedGenieAssistant,
} from "@/lib/genie/accumulate-genie-sse-event";
import type { GenieAssistantJobResult, GenieJobMetadata } from "@/lib/genie/genie-job-types";

export type RunGenieAgentBackgroundJobParams = {
  jobId: string;
  origin: string;
  cookieHeader: string;
  conversationId?: string | null;
  composioSessionIds?: Record<string, string>;
  messages: Record<string, unknown>[];
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
    console.error("[runGenieAgentBackgroundJob] failed to sync conversation", conversationId, error);
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

export async function runGenieAgentBackgroundJob(params: RunGenieAgentBackgroundJobParams) {
  const now = new Date().toISOString();
  await updateJob(params.jobId, {
    status: "running",
    started_at: now,
    message: "Starting Genie…",
    progress_phase: "setup",
  });

  let assistant = createEmptyGenieAssistant();
  let stepIndex = 0;
  let lastPersistAt = 0;
  let lastResultPersistAt = 0;
  let lastCancelCheckAt = 0;
  let jobWriteQueue: Promise<void> = Promise.resolve();

  const queueJobUpdate = (patch: Record<string, unknown>) => {
    jobWriteQueue = jobWriteQueue
      .catch(() => undefined)
      .then(() => updateJob(params.jobId, patch))
      .catch((error) => {
        console.error("[runGenieAgentBackgroundJob] queued job update failed", params.jobId, error);
      });
  };

  const flushJobUpdates = async () => {
    await jobWriteQueue.catch(() => undefined);
  };

  const assertNotCancelled = async (force = false) => {
    const ts = Date.now();
    if (!force && ts - lastCancelCheckAt < 2000) return;
    lastCancelCheckAt = ts;
    if (await isJobCancelled(params.jobId)) {
      throw new Error("cancelled");
    }
  };

  const shouldPersistPartialResult = (event: Record<string, unknown>) =>
    [
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
    ].includes(String(event.event));

  const persistProgress = async (
    event: Record<string, unknown>,
    metadata: GenieJobMetadata,
    force = false,
  ) => {
    const ts = Date.now();
    if (!force && ts - lastPersistAt < 1500) return;
    lastPersistAt = ts;

    queueJobUpdate({
      message: progressMessage(event),
      progress_phase: typeof event.phase === "string" ? event.phase : "thinking",
      metadata,
    });
  };

  try {
    const response = await fetch(`${params.origin}/api/genie/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.cookieHeader ? { cookie: params.cookieHeader } : {}),
      },
      body: JSON.stringify({
        conversation_id: params.conversationId ?? undefined,
        composio_session_ids: params.composioSessionIds ?? {},
        messages: params.messages,
      }),
    });

    if (!response.ok || !response.body) {
      await updateJob(params.jobId, {
        status: "failed",
        error_message: `Agent request failed (${response.status})`,
        completed_at: new Date().toISOString(),
        message: "Failed",
      });
      return;
    }

    let metadata: GenieJobMetadata = {};
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from("genie_background_jobs")
      .select("metadata")
      .eq("id", params.jobId)
      .maybeSingle();
    metadata = (existing?.metadata as GenieJobMetadata | null) ?? {};

    let finished = false;

    await readSSE(response.body, async (event) => {
      await assertNotCancelled();

      assistant = applyGenieSseEvent(event, assistant);

      if (shouldPersistPartialResult(event)) {
        const ts = Date.now();
        if (ts - lastResultPersistAt >= 700) {
          lastResultPersistAt = ts;
          const result: GenieAssistantJobResult = { assistantMessage: assistant };
          queueJobUpdate({ result });
        }
      }

      if (event.event === "status" || event.event === "heartbeat") {
        stepIndex += 1;
        metadata = { ...metadata, step_index: stepIndex };
        void persistProgress(event, metadata);
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

      if (event.event === "done") {
        finished = true;
      }

      if (event.event === "error") {
        finished = true;
      }
    });

    const completedAt = new Date().toISOString();
    const result: GenieAssistantJobResult = { assistantMessage: assistant };
    await flushJobUpdates();

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

    await syncCompletedConversation(params.conversationId, params.messages, assistant);

    if (!finished) {
      await updateJob(params.jobId, {
        status: "completed",
        result,
        completed_at: completedAt,
        message: "Complete",
        progress_phase: "done",
        metadata,
      });
      return;
    }

    await updateJob(params.jobId, {
      status: "completed",
      result,
      completed_at: completedAt,
      message: "Complete",
      progress_phase: "done",
      metadata,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "cancelled") {
      return;
    }

    await updateJob(params.jobId, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Background Genie job failed",
      completed_at: new Date().toISOString(),
      message: "Failed",
      progress_phase: "error",
    });
  }
}
