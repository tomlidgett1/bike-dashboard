"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type {
  GenieAssistantJobResult,
  GenieJob,
  GenieJobMetadata,
  GenieJobStatus,
  GenieModelProfile,
} from "@/lib/genie/genie-job-types";
import {
  applyGenieSseEvent,
  createEmptyGenieAssistant,
} from "@/lib/genie/accumulate-genie-sse-event";
import { appendRawDebugLog } from "@/lib/genie/analysis-events";
import type { GenieRawDebugLogEntry } from "@/lib/genie/genie-job-types";
import { readSSE } from "@/lib/optimize/read-sse";
import { persistCompletedHomeV2Job } from "@/lib/genie/homev2-conversation-storage";
import { loadGenieDismissedIds, saveGenieDismissedIds } from "@/lib/floating-panel-dismiss";

export type { GenieJob };

type StartBackgroundJobOptions = {
  messages: Record<string, unknown>[];
  prompt?: string;
  conversationId?: string | null;
  composioSessionIds?: Record<string, string>;
  clientAssistantId?: string;
  source?: "homev2" | "panel";
  modelProfile?: GenieModelProfile;
};

type GenieJobsContextValue = {
  jobs: GenieJob[];
  visibleJobs: GenieJob[];
  pillHidden: boolean;
  setPillHidden: (hidden: boolean) => void;
  startAgentBackgroundJob: (options: StartBackgroundJobOptions) => Promise<string | null>;
  cancelJob: (jobId: string) => Promise<void>;
  dismissJob: (jobId: string) => void;
  getJob: (jobId: string) => GenieJob | null;
  refreshJobs: () => Promise<void>;
};

const GenieJobsContext = React.createContext<GenieJobsContextValue | null>(null);

function mapJob(row: Record<string, unknown>): GenieJob {
  const metadata = (row.metadata as GenieJobMetadata | null) ?? {};
  const result = row.result as GenieAssistantJobResult | null | undefined;

  return {
    id: row.id as string,
    status: row.status as GenieJobStatus,
    prompt: (row.prompt as string) ?? "",
    message: (row.message as string | null) ?? null,
    progressPhase: (row.progress_phase as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    conversationId: (row.conversation_id as string | null) ?? null,
    metadata,
    result: result ?? null,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function isActive(job: GenieJob) {
  return job.status === "queued" || job.status === "running";
}

function buildOptimisticJob(jobId: string, options: StartBackgroundJobOptions): GenieJob {
  return {
    id: jobId,
    status: "running",
    prompt: options.prompt ?? "",
    message: "Starting Genie…",
    progressPhase: "setup",
    errorMessage: null,
    conversationId: options.conversationId ?? null,
    metadata: {
      composio_session_ids: options.composioSessionIds,
      client_assistant_id: options.clientAssistantId,
      source: options.source,
      step_index: 0,
    },
    result: null,
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
}

export function useGenieJobs() {
  const context = React.useContext(GenieJobsContext);
  if (!context) {
    throw new Error("useGenieJobs must be used within GenieJobsProvider");
  }
  return context;
}

const HOME_PATH = "/settings/store/home";

export function GenieJobsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnHome = pathname === HOME_PATH;
  const [jobs, setJobs] = React.useState<GenieJob[]>([]);
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(() =>
    loadGenieDismissedIds(),
  );
  const [pillHidden, setPillHidden] = React.useState(true);
  const [nowMs, setNowMs] = React.useState(0);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Jobs currently fed by a live SSE stream — polling must not clobber their
  // streaming state with the (throttled, staler) job-row snapshots.
  const liveJobIdsRef = React.useRef(new Set<string>());

  const dismissedRef = React.useRef(dismissedIds);
  dismissedRef.current = dismissedIds;

  React.useEffect(() => {
    saveGenieDismissedIds(dismissedIds);
  }, [dismissedIds]);

  const mergeJobs = React.useCallback((incoming: GenieJob[]) => {
    const dismissed = dismissedRef.current;
    setJobs((prev) => {
      const byId = new Map(
        prev.filter((job) => !dismissed.has(job.id)).map((job) => [job.id, job]),
      );
      for (const job of incoming) {
        if (dismissed.has(job.id)) continue;
        byId.set(job.id, job);
      }
      return [...byId.values()].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    });
  }, []);

  const refreshJobs = React.useCallback(async () => {
    try {
      const response = await fetch("/api/genie/background");
      if (!response.ok) return;

      const now = Date.now();
      setNowMs(now);
      const json = (await response.json()) as { jobs?: Record<string, unknown>[] };
      const incoming = (json.jobs ?? []).map(mapJob);
      const dismissed = dismissedRef.current;
      const live = liveJobIdsRef.current;
      const tracked = incoming.filter(
        (job) =>
          !dismissed.has(job.id) &&
          // A polled snapshot of a live-streamed job is always staler than the
          // stream — only accept it once the server says the job is terminal.
          (!live.has(job.id) || !isActive(job)) &&
          (isActive(job) ||
            job.status === "failed" ||
            (job.status === "completed" &&
              job.completedAt &&
              now - new Date(job.completedAt).getTime() < 10 * 60 * 1000)),
      );
      const nextJobs = tracked.slice(0, 12);
      mergeJobs(nextJobs);
      for (const job of nextJobs) {
        persistCompletedHomeV2Job(job);
      }
    } catch {
      // Ignore polling errors
    }
  }, [mergeJobs]);

  React.useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  React.useEffect(() => {
    const hasActive = jobs.some(isActive);
    if (!hasActive) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // Live SSE streams carry the realtime updates now; polling is the resume /
    // fallback path. Poll faster only when an active job has no live stream
    // (e.g. resumed after navigation), otherwise just heartbeat-poll.
    const hasNonLiveActive = jobs.some(
      (job) => isActive(job) && !liveJobIdsRef.current.has(job.id),
    );
    const intervalMs = hasNonLiveActive ? (isOnHome ? 1500 : 2000) : 5000;

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    pollRef.current = setInterval(() => {
      void refreshJobs();
    }, intervalMs);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs, refreshJobs, isOnHome]);

  const registerJob = React.useCallback(
    (job: GenieJob) => {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
      mergeJobs([job]);
      void refreshJobs();
    },
    [mergeJobs, refreshJobs],
  );

  /**
   * Consumes the live SSE stream for a just-started job: the first `job` event
   * carries the job id (reported via onJobId so the caller can return it while
   * consumption continues), then events are applied to the tracked job at
   * streaming cadence (throttled to ~10 UI flushes/sec). If the stream drops,
   * polling takes over — the job row is the durable source.
   */
  const consumeLiveJobStream = React.useCallback(
    async (
      body: ReadableStream<Uint8Array>,
      options: StartBackgroundJobOptions,
      onJobId: (jobId: string | null) => void,
    ) => {
      let jobId: string | null = null;
      let assistant = createEmptyGenieAssistant();
      let message: string | null = null;
      let phase: string | null = null;
      let rawDebugLogs: GenieRawDebugLogEntry[] = [];
      let terminal: { status: GenieJobStatus; errorMessage: string | null } | null = null;
      let flushTimer: number | null = null;

      const flush = () => {
        const completedAt = terminal ? new Date().toISOString() : null;
        setJobs((prev) =>
          prev.map((job) => {
            if (job.id !== jobId) return job;
            const next: GenieJob = {
              ...job,
              status: terminal?.status ?? "running",
              message: message ?? job.message,
              progressPhase: phase ?? job.progressPhase,
              errorMessage: terminal?.errorMessage ?? job.errorMessage,
              result: { assistantMessage: assistant as unknown as Record<string, unknown> },
              metadata: {
                ...job.metadata,
                raw_debug_logs: rawDebugLogs,
              },
              updatedAt: new Date().toISOString(),
              completedAt: completedAt ?? job.completedAt,
            };
            if (next.status === "completed") {
              persistCompletedHomeV2Job(next);
            }
            return next;
          }),
        );
      };

      const scheduleFlush = () => {
        if (flushTimer != null) return;
        flushTimer = window.setTimeout(() => {
          flushTimer = null;
          flush();
        }, 100);
      };

      try {
        await readSSE(body, (event) => {
          if (event.event === "job") {
            if (jobId == null && typeof event.job_id === "string") {
              jobId = event.job_id;
              liveJobIdsRef.current.add(jobId);
              registerJob(buildOptimisticJob(jobId, options));
              onJobId(jobId);
            }
            return;
          }
          if (jobId == null) return;
          if (event.event !== "heartbeat") {
            rawDebugLogs = appendRawDebugLog(rawDebugLogs, event as Record<string, unknown>);
          }
          if (event.event === "heartbeat") return;
          if (event.event === "status") {
            const text = String(event.text ?? "").trim();
            if (text) message = text.slice(0, 240);
            if (typeof event.phase === "string") phase = event.phase;
            scheduleFlush();
            return;
          }
          if (event.event === "done") {
            terminal = { status: "completed", errorMessage: null };
            scheduleFlush();
            return;
          }
          if (event.event === "error") {
            terminal = {
              status: "failed",
              errorMessage: String(event.message ?? "Genie request failed."),
            };
          }
          assistant = applyGenieSseEvent(event, assistant);
          scheduleFlush();
        });
      } catch {
        // Stream dropped (navigation, network) — polling resumes ownership.
      } finally {
        onJobId(null); // No-op if the job id already resolved.
        if (flushTimer != null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (jobId != null) {
          if (terminal) flush();
          liveJobIdsRef.current.delete(jobId);
          // Reconcile with the authoritative job row.
          void refreshJobs();
        }
      }
    },
    [refreshJobs, registerJob],
  );

  const startAgentBackgroundJob = React.useCallback(
    async (options: StartBackgroundJobOptions) => {
      const response = await fetch("/api/genie/agent/start-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: options.messages,
          prompt: options.prompt,
          conversation_id: options.conversationId,
          composio_session_ids: options.composioSessionIds ?? {},
          client_assistant_id: options.clientAssistantId,
          source: options.source ?? "panel",
          model_profile: options.modelProfile ?? "default",
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || "Failed to start Genie background job");
      }

      const contentType = response.headers.get("content-type") ?? "";

      // Deduplicated/legacy JSON response.
      if (!contentType.includes("text/event-stream") || !response.body) {
        const json = (await response.json()) as { jobId?: string };
        if (!json.jobId) throw new Error("Genie job id missing");
        registerJob(buildOptimisticJob(json.jobId, options));
        return json.jobId;
      }

      // Live SSE response: a single consumer reads the whole stream; the first
      // `job` event resolves the id so this call can return while events keep
      // flowing into the tracked job in the background.
      const jobId = await new Promise<string | null>((resolve) => {
        let settled = false;
        const settle = (value: string | null) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(value);
        };
        const timeout = window.setTimeout(() => settle(null), 15_000);
        void consumeLiveJobStream(response.body!, options, settle);
      });

      if (!jobId) {
        throw new Error("Genie job id missing");
      }

      return jobId;
    },
    [registerJob, consumeLiveJobStream],
  );

  const cancelJob = React.useCallback(
    async (jobId: string) => {
      await fetch(`/api/genie/background/${jobId}`, { method: "DELETE" });
      await refreshJobs();
    },
    [refreshJobs],
  );

  const dismissJob = React.useCallback((jobId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(jobId);
      return next;
    });
    setJobs((prev) => prev.filter((job) => job.id !== jobId));
  }, []);

  const getJob = React.useCallback(
    (jobId: string) => jobs.find((job) => job.id === jobId) ?? null,
    [jobs],
  );

  const visibleJobs = React.useMemo(
    () =>
      jobs.filter(
        (job) =>
          !dismissedIds.has(job.id) &&
          (isActive(job) ||
            job.status === "failed" ||
            (job.status === "completed" &&
              job.completedAt &&
              nowMs - new Date(job.completedAt).getTime() < 5 * 60 * 1000)),
      ),
    [jobs, dismissedIds, nowMs],
  );

  const value = React.useMemo(
    () => ({
      jobs,
      visibleJobs,
      pillHidden,
      setPillHidden,
      startAgentBackgroundJob,
      cancelJob,
      dismissJob,
      getJob,
      refreshJobs,
    }),
    [
      jobs,
      visibleJobs,
      pillHidden,
      startAgentBackgroundJob,
      cancelJob,
      dismissJob,
      getJob,
      refreshJobs,
    ],
  );

  return <GenieJobsContext.Provider value={value}>{children}</GenieJobsContext.Provider>;
}
