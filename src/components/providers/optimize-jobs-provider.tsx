"use client";

import * as React from "react";
import type { CopyBatchFields, CopyBatchJobMetadata } from "@/lib/optimize/copy-batch-job-types";

export type OptimizeJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type OptimizeJob = {
  id: string;
  jobType: string;
  status: OptimizeJobStatus;
  categoryId: string | null;
  categoryName: string | null;
  done: number;
  total: number;
  failed: number;
  skipped: number;
  message: string | null;
  errorMessage: string | null;
  updatedAt: string;
  completedAt: string | null;
  metadata: CopyBatchJobMetadata | null;
};

type OptimizeJobsContextValue = {
  jobs: OptimizeJob[];
  visibleJobs: OptimizeJob[];
  cardHidden: boolean;
  setCardHidden: (hidden: boolean) => void;
  startCategoryPreload: (
    categoryId: string,
    categoryName: string,
    options?: { force?: boolean },
  ) => Promise<string | null>;
  startCategoryCopy: (
    categoryId: string,
    categoryName: string,
  ) => Promise<string | null>;
  startCopyBatch: (options: {
    productIds: string[];
    copyFields: CopyBatchFields;
    bicycleOverrides?: Record<string, boolean>;
    label?: string;
  }) => Promise<string | null>;
  cancelJob: (jobId: string) => Promise<void>;
  dismissJob: (jobId: string) => void;
  getCategoryPreload: (categoryId: string) => OptimizeJob | null;
  getCategoryCopy: (categoryId: string) => OptimizeJob | null;
  getActiveCopyJob: () => OptimizeJob | null;
  refreshJobs: () => Promise<void>;
};

const OptimizeJobsContext = React.createContext<OptimizeJobsContextValue | null>(null);

function mapJob(row: Record<string, unknown>): OptimizeJob {
  const metadata = row.metadata as CopyBatchJobMetadata | null | undefined;

  return {
    id: row.id as string,
    jobType: row.job_type as string,
    status: row.status as OptimizeJobStatus,
    categoryId: (row.category_id as string | null) ?? null,
    categoryName: (row.category_name as string | null) ?? null,
    done: (row.done as number) ?? 0,
    total: (row.total as number) ?? 0,
    failed: (row.failed as number) ?? 0,
    skipped: (row.skipped as number) ?? 0,
    message: (row.message as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    metadata: metadata ?? null,
  };
}

function isActive(job: OptimizeJob) {
  return job.status === "queued" || job.status === "running";
}

export function useOptimizeJobs() {
  const context = React.useContext(OptimizeJobsContext);
  if (!context) {
    throw new Error("useOptimizeJobs must be used within OptimizeJobsProvider");
  }
  return context;
}

export function OptimizeJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = React.useState<OptimizeJob[]>([]);
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(() => new Set());
  const [cardHidden, setCardHidden] = React.useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const mergeJobs = React.useCallback((incoming: OptimizeJob[]) => {
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
      const response = await fetch("/api/optimize/background-jobs?active=false");
      if (!response.ok) return;

      const json = (await response.json()) as { jobs?: Record<string, unknown>[] };
      const active = (json.jobs || [])
        .map(mapJob)
        .filter((job) => isActive(job) || job.status === "completed" || job.status === "failed");

      mergeJobs(active.slice(0, 10));
    } catch {
      // Ignore polling errors
    }
  }, [mergeJobs]);

  const refreshActiveJobs = React.useCallback(async () => {
    try {
      const response = await fetch("/api/optimize/background-jobs?active=false");
      if (!response.ok) return;

      const json = (await response.json()) as { jobs?: Record<string, unknown>[] };
      const incoming = (json.jobs || []).map(mapJob);

      setJobs((prev) => {
        const trackedActiveIds = new Set(
          prev.filter((job) => isActive(job)).map((job) => job.id),
        );
        const toMerge = incoming.filter(
          (job) => isActive(job) || trackedActiveIds.has(job.id),
        );
        const byId = new Map(prev.map((job) => [job.id, job]));
        for (const job of toMerge) {
          byId.set(job.id, job);
        }
        return [...byId.values()].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      });
    } catch {
      // Ignore polling errors
    }
  }, []);

  React.useEffect(() => {
    void refreshActiveJobs();
  }, [refreshActiveJobs]);

  React.useEffect(() => {
    const hasActive = jobs.some(isActive);
    if (!hasActive) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    if (!pollRef.current) {
      pollRef.current = setInterval(() => {
        void refreshActiveJobs();
      }, 2000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs, refreshActiveJobs]);

  const registerJob = React.useCallback(
    (job: OptimizeJob) => {
      setCardHidden(false);
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
      mergeJobs([job]);
      void refreshActiveJobs();
    },
    [mergeJobs, refreshActiveJobs],
  );

  const startCategoryPreload = React.useCallback(
    async (categoryId: string, categoryName: string, options?: { force?: boolean }) => {
      if (categoryId === "all") return null;

      const response = await fetch("/api/optimize/preload-category-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          categoryName,
          force: options?.force === true,
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || "Failed to start category image preload");
      }

      const json = (await response.json()) as { jobId?: string };
      if (!json.jobId) {
        throw new Error("Preload job id missing");
      }

      registerJob({
        id: json.jobId,
        jobType: "category_image_preload",
        status: "queued",
        categoryId,
        categoryName,
        done: 0,
        total: 0,
        failed: 0,
        skipped: 0,
        message: "Starting preload…",
        errorMessage: null,
        updatedAt: new Date().toISOString(),
        completedAt: null,
        metadata: null,
      });

      return json.jobId;
    },
    [registerJob],
  );

  const startCategoryCopy = React.useCallback(
    async (categoryId: string, categoryName: string) => {
      if (categoryId === "all") return null;

      const response = await fetch("/api/optimize/start-category-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          categoryName,
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || "Failed to start category copy batch");
      }

      const json = (await response.json()) as { jobId?: string; total?: number };
      if (!json.jobId) {
        throw new Error("Copy batch job id missing");
      }

      const total = json.total ?? 0;
      const label = `Copy · ${categoryName}`;

      registerJob({
        id: json.jobId,
        jobType: "copy_batch",
        status: "queued",
        categoryId,
        categoryName: label,
        done: 0,
        total,
        failed: 0,
        skipped: 0,
        message: "Starting copy generation…",
        errorMessage: null,
        updatedAt: new Date().toISOString(),
        completedAt: null,
        metadata: {
          productIds: [],
          copyFields: { title: true, description: true, specs: true },
          bicycleOverrides: {},
          completedProductIds: [],
          failedProductIds: [],
        },
      });

      return json.jobId;
    },
    [registerJob],
  );

  const startCopyBatch = React.useCallback(
    async (options: {
      productIds: string[];
      copyFields: CopyBatchFields;
      bicycleOverrides?: Record<string, boolean>;
      label?: string;
    }) => {
      const { productIds, copyFields, bicycleOverrides = {}, label } = options;
      if (productIds.length === 0) return null;

      const response = await fetch("/api/optimize/start-copy-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds,
          copyFields,
          bicycleOverrides,
          label: label || `Copy · ${productIds.length} products`,
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || "Failed to start copy batch");
      }

      const json = (await response.json()) as { jobId?: string };
      if (!json.jobId) {
        throw new Error("Copy batch job id missing");
      }

      registerJob({
        id: json.jobId,
        jobType: "copy_batch",
        status: "queued",
        categoryId: null,
        categoryName: label || `Copy · ${productIds.length} products`,
        done: 0,
        total: productIds.length,
        failed: 0,
        skipped: 0,
        message: "Starting copy generation…",
        errorMessage: null,
        updatedAt: new Date().toISOString(),
        completedAt: null,
        metadata: {
          productIds,
          copyFields,
          bicycleOverrides,
          completedProductIds: [],
          failedProductIds: [],
        },
      });

      return json.jobId;
    },
    [registerJob],
  );

  const cancelJob = React.useCallback(async (jobId: string) => {
    await fetch(`/api/optimize/background-jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    await refreshActiveJobs();
  }, [refreshActiveJobs]);

  const dismissJob = React.useCallback((jobId: string) => {
    setDismissedIds((prev) => new Set(prev).add(jobId));
  }, []);

  const getCategoryPreload = React.useCallback(
    (categoryId: string) => {
      return (
        jobs.find(
          (job) =>
            job.categoryId === categoryId &&
            job.jobType === "category_image_preload" &&
            (isActive(job) ||
              (job.status === "completed" &&
                job.completedAt &&
                Date.now() - new Date(job.completedAt).getTime() < 5 * 60 * 1000)),
        ) ?? null
      );
    },
    [jobs],
  );

  const getCategoryCopy = React.useCallback(
    (categoryId: string) => {
      return (
        jobs.find(
          (job) =>
            job.categoryId === categoryId &&
            job.jobType === "copy_batch" &&
            (isActive(job) ||
              (job.status === "completed" &&
                job.completedAt &&
                Date.now() - new Date(job.completedAt).getTime() < 5 * 60 * 1000)),
        ) ?? null
      );
    },
    [jobs],
  );

  const getActiveCopyJob = React.useCallback(() => {
    return jobs.find((job) => job.jobType === "copy_batch" && isActive(job)) ?? null;
  }, [jobs]);

  const visibleJobs = React.useMemo(
    () =>
      jobs.filter(
        (job) =>
          !dismissedIds.has(job.id) &&
          (isActive(job) ||
            (job.status === "completed" &&
              job.completedAt &&
              Date.now() - new Date(job.completedAt).getTime() < 2 * 60 * 1000) ||
            job.status === "failed"),
      ),
    [jobs, dismissedIds],
  );

  const value = React.useMemo(
    () => ({
      jobs,
      visibleJobs,
      cardHidden,
      setCardHidden,
      startCategoryPreload,
      startCategoryCopy,
      startCopyBatch,
      cancelJob,
      dismissJob,
      getCategoryPreload,
      getCategoryCopy,
      getActiveCopyJob,
      refreshJobs,
    }),
    [
      jobs,
      visibleJobs,
      cardHidden,
      startCategoryPreload,
      startCategoryCopy,
      startCopyBatch,
      cancelJob,
      dismissJob,
      getCategoryPreload,
      getCategoryCopy,
      getActiveCopyJob,
      refreshJobs,
    ],
  );

  return (
    <OptimizeJobsContext.Provider value={value}>{children}</OptimizeJobsContext.Provider>
  );
}
