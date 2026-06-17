"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Loader2, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { motion, AnimatePresence } from "framer-motion";
import { useGenieJobs, type GenieJob } from "@/components/providers/genie-jobs-provider";
import { homeConversationUrl } from "@/lib/genie/homev2-navigation";

const HOME_PATH = "/settings/store/home";

const WORKING_SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #a3a3a3 0%, #a3a3a3 38%, #525252 50%, #a3a3a3 62%, #a3a3a3 100%)",
  backgroundSize: "220% 100%",
};

function jobIsRunning(job: GenieJob) {
  return job.status === "queued" || job.status === "running";
}

type StepState = "done" | "active" | "pending" | "error";

function genieSteps(job: GenieJob) {
  const started = job.status !== "queued";
  const workingDone = !jobIsRunning(job) && job.status !== "failed";
  const finished = job.status === "completed";

  return [
    {
      id: "queue",
      label: "Queued",
      state: (started ? "done" : jobIsRunning(job) ? "active" : "pending") as StepState,
    },
    {
      id: "work",
      label: job.message?.trim() || "Thinking",
      state: (workingDone
        ? "done"
        : started && jobIsRunning(job)
          ? "active"
          : "pending") as StepState,
    },
    {
      id: "finish",
      label:
        job.status === "failed"
          ? job.errorMessage || "Genie failed"
          : job.status === "cancelled"
            ? "Cancelled"
            : "Finish",
      state: (job.status === "failed" || job.status === "cancelled"
        ? "error"
        : finished
          ? "done"
          : "pending") as StepState,
    },
  ];
}

function progressPercent(job: GenieJob) {
  if (job.status === "completed") return 100;
  if (job.status === "failed" || job.status === "cancelled") return 100;
  const step = job.metadata.step_index ?? 0;
  if (job.status === "queued") return 6;
  if (step <= 0) return 18;
  return Math.min(92, 18 + step * 5);
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
        <Check className="h-3 w-3" />
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

function JobProgressBar({ job }: { job: GenieJob }) {
  const percent = progressPercent(job);

  return (
    <div
      className="mt-3"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-2 w-full overflow-hidden rounded-md bg-gray-100">
        <div
          className="h-full rounded-md bg-gray-800 transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function JobCard({
  job,
  onDismiss,
  onCancel,
}: {
  job: GenieJob;
  onDismiss: () => void;
  onCancel: () => void;
}) {
  const steps = genieSteps(job);
  const running = jobIsRunning(job);
  const href =
    job.metadata.source === "homev2" && job.conversationId
      ? homeConversationUrl(job.conversationId)
      : undefined;

  return (
    <div className="border-t border-gray-100 px-5 py-4 first:border-t-0">
      <p className="text-sm font-medium text-gray-800">Genie</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{job.prompt}</p>

      <JobProgressBar job={job} />

      <ul className="mt-3 space-y-2.5">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5">
            <StepIcon state={step.state} />
            <span className="text-sm leading-snug text-gray-700">{step.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!running && job.status === "completed" && href ? (
          <Link
            href={href}
            className="text-xs font-medium text-gray-700 underline-offset-2 hover:underline"
          >
            View conversation
          </Link>
        ) : null}
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
          >
            Cancel
          </button>
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


export function FloatingGenieJobsPill() {
  const pathname = usePathname();
  const { visibleJobs, pillHidden, setPillHidden, dismissJob, cancelJob } = useGenieJobs();
  const wasOnHomeRef = React.useRef(pathname === HOME_PATH);
  const isOnHome = pathname === HOME_PATH;
  const pillLabel = "Working";

  React.useEffect(() => {
    const leftHome = wasOnHomeRef.current && !isOnHome;
    if (leftHome && visibleJobs.length > 0) {
      setPillHidden(true);
    }
    wasOnHomeRef.current = isOnHome;
  }, [isOnHome, setPillHidden, visibleJobs.length]);

  if (isOnHome || visibleJobs.length === 0) {
    return null;
  }

  if (pillHidden) {
    return (
      <button
        type="button"
        onClick={() => setPillHidden(false)}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-lg transition hover:bg-gray-50"
        aria-label="Show Genie progress"
      >
        <span
          className="text-transparent bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite] text-gray-600"
          style={WORKING_SHIMMER_STYLE}
        >
          {pillLabel}
        </span>
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
        <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <p className="text-sm font-medium text-gray-500">Genie</p>
            <button
              type="button"
              onClick={() => setPillHidden(true)}
              className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              aria-label="Hide Genie progress"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {visibleJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onDismiss={() => dismissJob(job.id)}
              onCancel={() => void cancelJob(job.id)}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
