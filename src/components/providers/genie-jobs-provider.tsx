"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type {
  GenieAssistantJobResult,
  GenieJob,
  GenieJobMetadata,
  GenieJobStatus,
} from "@/lib/genie/genie-job-types";
import { persistCompletedHomeV2Job } from "@/lib/genie/homev2-conversation-storage";

export type { GenieJob };

type StartBackgroundJobOptions = {
  messages: Record<string, unknown>[];
  prompt?: string;
  conversationId?: string | null;
  composioSessionIds?: Record<string, string>;
  clientAssistantId?: string;
  source?: "homev2" | "panel";
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
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(() => new Set());
  const [pillHidden, setPillHidden] = React.useState(true);
  const [nowMs, setNowMs] = React.useState(0);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const mergeJobs = React.useCallback((incoming: GenieJob[]) => {
    setJobs((prev) => {
      const byId = new Map(prev.map((job) => [job.id, job]));
      for (const job of incoming) {
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
      const tracked = incoming.filter(
        (job) =>
          isActive(job) ||
          job.status === "failed" ||
          (job.status === "completed" &&
            job.completedAt &&
            now - new Date(job.completedAt).getTime() < 10 * 60 * 1000),
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

    const intervalMs = isOnHome ? 900 : 2000;

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
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || "Failed to start Genie background job");
      }

      const json = (await response.json()) as { jobId?: string };
      if (!json.jobId) {
        throw new Error("Genie job id missing");
      }

      const registeredJob: GenieJob = {
        id: json.jobId,
        status: "queued",
        prompt: options.prompt ?? "",
        message: "Queued…",
        progressPhase: "queued",
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
      registerJob(registeredJob);

      return json.jobId;
    },
    [registerJob],
  );

  const cancelJob = React.useCallback(
    async (jobId: string) => {
      await fetch(`/api/genie/background/${jobId}`, { method: "DELETE" });
      await refreshJobs();
    },
    [refreshJobs],
  );

  const dismissJob = React.useCallback((jobId: string) => {
    setDismissedIds((prev) => new Set(prev).add(jobId));
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
