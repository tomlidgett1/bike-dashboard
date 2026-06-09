"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp, Loader2, StopCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  useOptimizeJobs,
  type OptimizeJob,
} from "@/components/providers/optimize-jobs-provider";
import { cn } from "@/lib/utils";

const WORKING_SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #a3a3a3 0%, #a3a3a3 38%, #525252 50%, #a3a3a3 62%, #a3a3a3 100%)",
  backgroundSize: "220% 100%",
};

function jobIsRunning(job: OptimizeJob) {
  return job.status === "queued" || job.status === "running";
}

type StepState = "done" | "active" | "pending" | "error";

function jobTitle(job: OptimizeJob) {
  if (job.categoryName?.trim()) return job.categoryName.trim();
  if (job.jobType === "copy_batch") return "Copy generation";
  return "Category preload";
}

function jobTypeLabel(job: OptimizeJob) {
  if (job.jobType === "copy_batch") return "Copy";
  if (job.jobType === "category_image_preload") return "Photos";
  return "Optimise";
}

function activeStepLabel(job: OptimizeJob) {
  const steps = progressSteps(job);
  const active = steps.find((step) => step.state === "active");
  if (active) return active.label;
  if (job.status === "completed") return "Complete";
  if (job.status === "failed") return job.errorMessage || "Failed";
  if (job.status === "cancelled") return "Cancelled";
  return job.message || "Queued";
}

function jobProgressPercent(job: OptimizeJob) {
  if (job.total <= 0) {
    if (job.status === "completed") return 100;
    if (job.status === "failed" || job.status === "cancelled") return 100;
    return job.status === "queued" ? 8 : 24;
  }
  return Math.min(100, Math.round((job.done / job.total) * 100));
}

function summariseJobs(jobs: OptimizeJob[]) {
  const running = jobs.filter(jobIsRunning).length;
  const completed = jobs.filter((job) => job.status === "completed").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  return { running, completed, failed, total: jobs.length };
}

function preloadSteps(job: OptimizeJob) {
  const loadingDone = job.total > 0 || job.message?.includes("Nothing to preload");
  const searchingDone = !jobIsRunning(job) && job.status !== "failed";
  const finished = job.status === "completed";

  return [
    {
      id: "load",
      label: "Load products in category",
      state: (loadingDone ? "done" : jobIsRunning(job) ? "active" : "pending") as StepState,
    },
    {
      id: "search",
      label: "Search Serper and cache images",
      state: (searchingDone
        ? "done"
        : loadingDone && jobIsRunning(job)
          ? "active"
          : "pending") as StepState,
    },
    {
      id: "finish",
      label:
        job.status === "failed"
          ? job.errorMessage || "Preload failed"
          : job.status === "cancelled"
            ? "Preload cancelled"
            : "Finish and save to cache",
      state: (job.status === "failed" || job.status === "cancelled"
        ? "error"
        : finished
          ? "done"
          : "pending") as StepState,
    },
  ];
}

function copyBatchSteps(job: OptimizeJob) {
  const started = job.total > 0;
  const generatingDone = !jobIsRunning(job) && job.status !== "failed";
  const finished = job.status === "completed";

  return [
    {
      id: "prepare",
      label: started ? `Prepare ${job.total} products` : "Prepare products",
      state: (started ? "done" : jobIsRunning(job) ? "active" : "pending") as StepState,
    },
    {
      id: "generate",
      label: "Generate titles and copy",
      state: (generatingDone
        ? "done"
        : started && jobIsRunning(job)
          ? "active"
          : "pending") as StepState,
    },
    {
      id: "finish",
      label:
        job.status === "failed"
          ? job.errorMessage || "Copy generation failed"
          : job.status === "cancelled"
            ? "Copy generation cancelled"
            : "Save to catalogue",
      state: (job.status === "failed" || job.status === "cancelled"
        ? "error"
        : finished
          ? "done"
          : "pending") as StepState,
    },
  ];
}

function progressSteps(job: OptimizeJob) {
  if (job.jobType === "copy_batch") return copyBatchSteps(job);
  return preloadSteps(job);
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "active") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white">
        <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
      </span>
    );
  }

  if (state === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-400 text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white" />
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white" />
  );
}

function JobStatusIcon({ job }: { job: OptimizeJob }) {
  if (jobIsRunning(job)) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white">
        <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
      </span>
    );
  }

  if (job.status === "completed") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white" />
  );
}

function JobProgressBar({
  job,
  compact = false,
}: {
  job: OptimizeJob;
  compact?: boolean;
}) {
  const percent = jobProgressPercent(job);

  return (
    <div
      className={cn(compact ? "mt-2" : "mt-3")}
      role="progressbar"
      aria-valuenow={job.total > 0 ? job.done : percent}
      aria-valuemin={0}
      aria-valuemax={job.total > 0 ? job.total : 100}
    >
      <div className={cn("w-full overflow-hidden rounded-md bg-gray-100", compact ? "h-1.5" : "h-2")}>
        <div
          className="h-full rounded-md bg-gray-800 transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function JobDetail({
  job,
  onDismiss,
  onCancel,
  showTitle = true,
}: {
  job: OptimizeJob;
  onDismiss: () => void;
  onCancel: () => void;
  showTitle?: boolean;
}) {
  const running = jobIsRunning(job);
  const steps = progressSteps(job);

  return (
    <div className="px-5 pb-4">
      {showTitle ? (
        <>
          <p className="text-sm font-medium text-gray-800">{jobTitle(job)}</p>
          {job.skipped > 0 ? (
            <p className="mt-0.5 text-xs text-gray-500">
              {job.skipped} already cached or approved
              {job.failed > 0 ? ` · ${job.failed} failed` : ""}
            </p>
          ) : job.failed > 0 ? (
            <p className="mt-0.5 text-xs text-gray-500">{job.failed} failed</p>
          ) : null}
        </>
      ) : null}

      <JobProgressBar job={job} />

      <ul className="mt-3 space-y-2.5">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5">
            <StepIcon state={step.state} />
            <span className="text-sm leading-snug text-gray-700">{step.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {running ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            <StopCircle className="size-4" />
            Stop
          </Button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function JobCompactRow({
  job,
  expanded,
  onToggle,
  onDismiss,
  onCancel,
}: {
  job: OptimizeJob;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onCancel: () => void;
}) {
  const running = jobIsRunning(job);
  const percent = jobProgressPercent(job);

  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-3 text-left transition hover:bg-gray-50"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <JobStatusIcon job={job} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-gray-800">{jobTitle(job)}</p>
              <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {jobTypeLabel(job)}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{activeStepLabel(job)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {job.total > 0 ? (
              <span className="text-xs tabular-nums text-gray-500">
                {job.done}/{job.total}
              </span>
            ) : running ? (
              <span className="text-xs text-gray-500">{percent}%</span>
            ) : null}
            {running ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel();
                }}
                className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                aria-label="Stop job"
              >
                <StopCircle className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss();
                }}
                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Dismiss job"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-gray-400 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </div>
        </div>
        {running || job.total > 0 ? <JobProgressBar job={job} compact /> : null}
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden border-t border-gray-100 bg-gray-50/60"
          >
            <JobDetail
              job={job}
              onDismiss={onDismiss}
              onCancel={onCancel}
              showTitle={false}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function headerSummary(jobs: OptimizeJob[]) {
  const { running, completed, failed, total } = summariseJobs(jobs);

  if (running > 0 && completed > 0) {
    return `${running} running · ${completed} complete`;
  }
  if (running > 1) {
    return `${running} jobs running`;
  }
  if (running === 1) {
    return "1 job running";
  }
  if (failed > 0 && completed > 0) {
    return `${completed} complete · ${failed} failed`;
  }
  if (failed > 0) {
    return failed === 1 ? "1 job failed" : `${failed} jobs failed`;
  }
  if (completed > 1) {
    return `${completed} jobs complete`;
  }
  if (total === 1) {
    return "Progress";
  }
  return `${total} jobs`;
}

function collapsedPillLabel(jobs: OptimizeJob[]) {
  const { running, completed } = summariseJobs(jobs);
  if (running > 1) return `Working · ${running}`;
  if (running === 1) return "Working";
  if (completed > 0) return completed > 1 ? `Complete · ${completed}` : "Complete";
  return "Progress";
}

export function FloatingOptimizeJobsCard() {
  const { visibleJobs, cardHidden, setCardHidden, dismissJob, cancelJob } =
    useOptimizeJobs();
  const [expandedJobIds, setExpandedJobIds] = React.useState<Set<string>>(() => new Set());
  const hasRunning = visibleJobs.some(jobIsRunning);
  const hasComplete = visibleJobs.some((job) => job.status === "completed");
  const multiJob = visibleJobs.length > 1;

  React.useEffect(() => {
    setExpandedJobIds((prev) => {
      const visibleIds = new Set(visibleJobs.map((job) => job.id));
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));

      if (visibleJobs.length === 1) {
        next.add(visibleJobs[0].id);
        return next;
      }

      const runningJobs = visibleJobs.filter(jobIsRunning);
      if (runningJobs.length === 1 && next.size === 0) {
        next.add(runningJobs[0].id);
      }

      return next;
    });
  }, [visibleJobs]);

  const toggleExpanded = React.useCallback((jobId: string) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }, []);

  if (visibleJobs.length === 0) {
    return null;
  }

  if (cardHidden) {
    const pillLabel = collapsedPillLabel(visibleJobs);

    return (
      <button
        type="button"
        onClick={() => setCardHidden(false)}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-lg transition hover:bg-gray-50"
        aria-label="Show optimise progress"
      >
        {hasRunning ? (
          <span
            className="text-transparent bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite] text-gray-600"
            style={WORKING_SHIMMER_STYLE}
          >
            {pillLabel}
          </span>
        ) : hasComplete ? (
          <>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-gray-800">{pillLabel}</span>
          </>
        ) : (
          <>
            <ChevronUp className="h-4 w-4 text-gray-500" />
            <span className="text-gray-800">{pillLabel}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-[min(100vw-2rem,22rem)]"
      >
        <div className="flex max-h-[min(70vh,28rem)] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {hasComplete && !hasRunning ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : null}
                <p className="text-sm font-medium text-gray-800">
                  {hasComplete && !hasRunning ? "Complete" : "Optimise"}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{headerSummary(visibleJobs)}</p>
            </div>
            <button
              type="button"
              onClick={() => setCardHidden(true)}
              className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              aria-label="Hide progress card"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {multiJob ? (
              visibleJobs.map((job) => (
                <JobCompactRow
                  key={job.id}
                  job={job}
                  expanded={expandedJobIds.has(job.id)}
                  onToggle={() => toggleExpanded(job.id)}
                  onDismiss={() => dismissJob(job.id)}
                  onCancel={() => void cancelJob(job.id)}
                />
              ))
            ) : (
              <div className="px-5 py-4">
                <JobDetail
                  job={visibleJobs[0]}
                  onDismiss={() => dismissJob(visibleJobs[0].id)}
                  onCancel={() => void cancelJob(visibleJobs[0].id)}
                />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
