"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "@/components/layout/app-sidebar/dashboard-icons";
import { Badge } from "@/components/ui/badge";
import { GenieChart } from "@/components/genie/genie-chart";
import { GenieDataTable } from "@/components/genie/genie-data-table";
import { GeniePivotTable } from "@/components/genie/genie-pivot-table";
import { PinToDashboardButton } from "@/components/genie/pin-to-dashboard-button";
import {
  GenieThinkingPlanSection,
  GenieThinkingQueriesSection,
} from "@/components/genie/genie-thinking-detail-sections";
import { GenieMarkdownContent } from "@/components/genie/genie-markdown-content";
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
} from "@/lib/types/genie-agent";
import type {
  GenieChartPayload,
  GenieTablePayload,
} from "@/lib/genie/visual-payloads";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import { cn } from "@/lib/utils";

export type MetricsInvestigationState = {
  content: string;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  pivotTables?: GeniePivotTablePayload[];
  isStreaming?: boolean;
  status?: string;
};

function InvestigationSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-md border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
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
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 py-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function extractDriverLines(content: string): string[] {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.filter(
    (line) =>
      /^(\d+[\).\]]|[-*•])\s/.test(line) &&
      /(\$|%|driver|contributed|decline|increase|drop|rose|fell)/i.test(line),
  ).slice(0, 6);
}

export function MetricsInvestigationPanel({
  state,
}: {
  state: MetricsInvestigationState | null;
}) {
  if (!state) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-900">Investigation workspace</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Ask a business question in the chat panel. Assumptions, drivers, evidence, and data quality checks will appear here as the agent investigates.
        </p>
      </div>
    );
  }

  const drivers = extractDriverLines(state.content);
  const freshnessQuery = state.analysisQueries?.find((query) => query.tool_name === "check_data_freshness");
  const metricQueries = state.analysisQueries?.filter((query) =>
    ["run_metric_query", "run_segment_breakdown", "run_lightspeed_sql_query"].includes(query.tool_name),
  );

  return (
    <div className="space-y-3">
      {state.analysisPlan ? (
        <InvestigationSection title="Assumptions" defaultOpen>
          <div className="space-y-2 text-sm text-gray-700">
            {state.analysisPlan.user_intent ? (
              <p>
                <span className="font-medium text-gray-900">Intent:</span>{" "}
                {state.analysisPlan.user_intent}
              </p>
            ) : null}
            {state.analysisPlan.date_range_label ? (
              <p>
                <span className="font-medium text-gray-900">Period:</span>{" "}
                {state.analysisPlan.date_range_label}
              </p>
            ) : null}
            {state.analysisPlan.sql_strategy_summary ? (
              <p>
                <span className="font-medium text-gray-900">Strategy:</span>{" "}
                {state.analysisPlan.sql_strategy_summary}
              </p>
            ) : null}
            <GenieThinkingPlanSection plan={state.analysisPlan} defaultOpen={false} />
          </div>
        </InvestigationSection>
      ) : null}

      <InvestigationSection title="Answer">
        {state.isStreaming && !state.content ? (
          <p className="text-sm text-muted-foreground">{state.status ?? "Investigating…"}</p>
        ) : (
          <GenieMarkdownContent content={state.content || "Waiting for synthesis…"} />
        )}
      </InvestigationSection>

      {drivers.length > 0 ? (
        <InvestigationSection title="Drivers">
          <ol className="space-y-2 text-sm text-gray-700">
            {drivers.map((driver, index) => (
              <li key={index} className="leading-6">
                {driver.replace(/^(\d+[\).\]]|[-*•])\s*/, "")}
              </li>
            ))}
          </ol>
        </InvestigationSection>
      ) : null}

      <InvestigationSection title="Evidence" defaultOpen={Boolean(state.charts?.length || state.tables?.length)}>
        <div className="space-y-4">
          {state.charts?.map((chart, index) => (
            <div key={`${chart.title}-${index}`} className="rounded-md border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{chart.title}</p>
                <PinToDashboardButton payload={{ type: "chart", data: chart }} title={chart.title} />
              </div>
              <GenieChart chart={chart} variant="panel" embedded />
            </div>
          ))}
          {state.tables?.map((table, index) => (
            <div key={`${table.title}-${index}`} className="rounded-md border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{table.title}</p>
                <PinToDashboardButton payload={{ type: "table", data: table }} title={table.title} />
              </div>
              <GenieDataTable table={table} variant="panel" embedded />
            </div>
          ))}
          {state.pivotTables?.map((pivot, index) => (
            <div key={`${pivot.title}-${index}`} className="rounded-md border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{pivot.title}</p>
                <PinToDashboardButton payload={{ type: "pivot", data: pivot }} title={pivot.title} />
              </div>
              <GeniePivotTable table={pivot} embedded />
            </div>
          ))}
          {!state.charts?.length && !state.tables?.length && !state.pivotTables?.length ? (
            <p className="text-sm text-muted-foreground">Charts and tables will appear here as the agent runs queries.</p>
          ) : null}
          {metricQueries?.length ? (
            <GenieThinkingQueriesSection queries={metricQueries} defaultOpen={false} />
          ) : null}
        </div>
      </InvestigationSection>

      <InvestigationSection title="Data quality" defaultOpen={false}>
        <div className="space-y-2 text-sm text-gray-700">
          {freshnessQuery ? (
            <Badge variant="outline" className="rounded-md border-gray-200 bg-gray-50 text-gray-700">
              Freshness check {freshnessQuery.status}
            </Badge>
          ) : (
            <p className="text-muted-foreground">Freshness checks run automatically during analysis.</p>
          )}
          {state.analysisQueries?.some((query) => query.status === "error" || query.status === "rejected") ? (
            <p className="text-amber-800">
              Some queries failed or were rejected. Review the evidence section before acting on the answer.
            </p>
          ) : (
            <p>No blocking data quality issues detected in the latest run.</p>
          )}
        </div>
      </InvestigationSection>

      <InvestigationSection title="Actions" defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md border-gray-200 bg-gray-50 text-gray-700">
            Pin charts to dashboard
          </Badge>
          <Badge variant="outline" className="rounded-md border-gray-200 bg-gray-50 text-gray-700">
            Ask a follow-up in chat
          </Badge>
          <Badge variant="outline" className="rounded-md border-gray-200 bg-gray-50 text-gray-700">
            Refine date range or segment
          </Badge>
        </div>
      </InvestigationSection>
    </div>
  );
}
