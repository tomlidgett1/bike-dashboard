"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieRawDebugLogEntry,
} from "@/lib/types/genie-agent";

const RAW_DEBUG_LOG_LIMIT = 2000;

const DROPDOWN_EASE = [0.04, 0.62, 0.23, 0.98] as const;

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

function formatQueryTime(at: string): string {
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return at;
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(parsed));
}

function queryStatusLabel(status: GenieAnalysisQueryPayload["status"]): string {
  if (status === "running") return "Running";
  if (status === "ok") return "Complete";
  if (status === "rejected") return "Rejected";
  return "Error";
}

function NestedDropdown({
  title,
  countLabel,
  defaultOpen,
  children,
}: {
  title: string;
  countLabel: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen ?? false);

  return (
    <div className="rounded-md bg-white ring-1 ring-black/[0.04]">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={isOpen}
      >
        <span className="min-w-0">
          <span className="text-xs font-semibold text-gray-900">{title}</span>
          <span className="mt-0.5 block text-[11px] text-gray-500">{countLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: DROPDOWN_EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-3 py-2.5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function GenieThinkingPlanSection({
  plan,
  defaultOpen,
}: {
  plan: GenieAnalysisPlanPayload;
  defaultOpen?: boolean;
}) {
  const stepCount = plan.execution_steps.length;
  if (stepCount === 0) return null;

  return (
    <NestedDropdown
      title="Plan"
      countLabel={`${stepCount} step${stepCount === 1 ? "" : "s"}${plan.source === "planner" ? " · planner" : " · agent"}`}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-2.5">
        {plan.user_intent ? (
          <div className="rounded-md bg-gray-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Intent</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-700">{plan.user_intent}</p>
          </div>
        ) : null}

        <ol className="space-y-1.5">
          {plan.execution_steps.map((step, index) => (
            <li key={`${index}-${step.slice(0, 24)}`} className="flex gap-2 text-xs leading-relaxed text-gray-700">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] font-medium text-gray-500">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">{step}</span>
            </li>
          ))}
        </ol>

        {plan.date_range_label ? (
          <p className="text-[11px] text-gray-500">
            <span className="font-medium text-gray-600">Date range:</span> {plan.date_range_label}
          </p>
        ) : null}

        {plan.primary_tools && plan.primary_tools.length > 0 ? (
          <p className="text-[11px] text-gray-500">
            <span className="font-medium text-gray-600">Tools:</span> {plan.primary_tools.join(", ")}
          </p>
        ) : null}

        {plan.sql_strategy_summary ? (
          <div className="rounded-md bg-gray-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">SQL strategy</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-600">{plan.sql_strategy_summary}</p>
          </div>
        ) : null}

        {plan.recheck_strategy ? (
          <p className="text-[11px] text-gray-500">
            <span className="font-medium text-gray-600">Recheck:</span> {plan.recheck_strategy}
          </p>
        ) : null}
      </div>
    </NestedDropdown>
  );
}

export function GenieThinkingQueriesSection({
  queries,
  defaultOpen,
}: {
  queries: GenieAnalysisQueryPayload[];
  defaultOpen?: boolean;
}) {
  if (queries.length === 0) return null;

  return (
    <NestedDropdown
      title="Queries"
      countLabel={`${queries.length} quer${queries.length === 1 ? "y" : "ies"}`}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-2">
        {queries.map((query) => (
          <div key={query.id} className="rounded-md bg-gray-50 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900">{query.purpose}</p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {query.tool_name.replaceAll("_", " ")} · {formatQueryTime(query.at)}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                  query.status === "ok" && "bg-gray-100 text-gray-700",
                  query.status === "running" && "bg-gray-100 text-gray-600",
                  (query.status === "error" || query.status === "rejected") && "bg-gray-100 text-gray-700",
                )}
              >
                {query.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {queryStatusLabel(query.status)}
                {query.status === "ok" && query.row_count != null ? ` · ${query.row_count} rows` : ""}
              </span>
            </div>

            {query.sql ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-white px-2 py-1.5 text-[10px] leading-relaxed text-gray-700 ring-1 ring-black/[0.04] [scrollbar-width:thin]">
                {query.sql}
              </pre>
            ) : null}

            {query.error ? (
              <p className="mt-2 text-[11px] leading-relaxed text-gray-600">{query.error}</p>
            ) : null}
          </div>
        ))}
      </div>
    </NestedDropdown>
  );
}

export function GenieThinkingDetailSections({
  plan,
  queries,
  live,
}: {
  plan?: GenieAnalysisPlanPayload | null;
  queries?: GenieAnalysisQueryPayload[];
  live?: boolean;
}) {
  const hasPlan = Boolean(plan?.execution_steps.length);
  const hasQueries = Boolean(queries?.length);
  if (!hasPlan && !hasQueries) return null;

  return (
    <div className="space-y-2">
      {hasPlan && plan ? (
        <GenieThinkingPlanSection plan={plan} defaultOpen={live} />
      ) : null}
      {hasQueries && queries ? (
        <GenieThinkingQueriesSection queries={queries} defaultOpen={live && !hasPlan} />
      ) : null}
    </div>
  );
}

export function GenieRawLogsViewer({
  logs,
  className,
}: {
  logs: GenieRawDebugLogEntry[];
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const formatted = React.useMemo(() => JSON.stringify(logs, null, 2), [logs]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">
          {logs.length} event{logs.length === 1 ? "" : "s"} · full SSE stream
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-gray-50 px-2.5 py-2 text-[10px] leading-relaxed text-gray-800 ring-1 ring-black/[0.04] [scrollbar-width:thin]">
        {formatted}
      </pre>
    </div>
  );
}

export function GenieRawLogsSection({
  logs,
  defaultOpen,
}: {
  logs?: GenieRawDebugLogEntry[];
  defaultOpen?: boolean;
}) {
  const count = logs?.length ?? 0;
  if (count === 0) return null;

  return (
    <NestedDropdown
      title="Raw logs"
      countLabel={`${count} event${count === 1 ? "" : "s"} · debug`}
      defaultOpen={defaultOpen}
    >
      <GenieRawLogsViewer logs={logs ?? []} className="max-h-80" />
    </NestedDropdown>
  );
}
