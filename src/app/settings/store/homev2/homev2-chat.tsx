"use client";

import * as React from "react";
import Image from "next/image";
import { createPortal, flushSync } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Download, History, LineChart as LineChartIcon, Pencil, Plus, Table2, Trash2, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { GenieProposalCard } from "@/components/genie/genie-proposal-card";
import { LightspeedWorkorderCards } from "@/components/genie/lightspeed-workorder-cards";
import { GenieStoreProductCards } from "@/components/genie/genie-store-product-cards";
import {
  GenieRawLogsViewer,
  GenieThinkingDetailSections,
  appendRawDebugLog,
  mergeAnalysisPlan,
  upsertAnalysisQuery,
} from "@/components/genie/genie-thinking-detail-sections";
import type { GenieStoreProductPreview } from "@/lib/genie/store-product-previews";
import { HomeV2MetricsCards } from "@/components/settings/homev2-metrics-cards";
import { HomeV2SmartSuggestions } from "@/components/settings/homev2-smart-suggestions";
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieProposal,
  GenieRawDebugLogEntry,
  GenieWorkorderCardsPayload,
} from "@/lib/types/genie-agent";
import { downloadChartCardAsPng, downloadTableCsv } from "@/lib/utils/genie-visual-export";
import { consumeHomeV2PendingPrompt } from "@/lib/genie/homev2-navigation";
import { compactGenieProgressText, liveGenieProgressPreview } from "@/lib/genie/progress-text";

type ChatRole = "user" | "assistant";
type VisualValueFormat = "currency" | "number" | "percent";

interface GenieChartSeries {
  key: string;
  label: string;
  color?: string;
}

interface GenieChartPoint {
  label: string;
  [key: string]: string | number | null;
}

interface GenieChartPayload {
  kind: "bar" | "line";
  title: string;
  subtitle?: string;
  xKey: "label";
  series: GenieChartSeries[];
  data: GenieChartPoint[];
  valueFormatter?: VisualValueFormat;
}

interface GenieTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: VisualValueFormat;
}

interface GenieTablePayload {
  title: string;
  subtitle?: string;
  columns: GenieTableColumn[];
  rows: Array<Record<string, string | number | null>>;
}

type SortDirection = "asc" | "desc";

interface TableSortState {
  key: string;
  direction: SortDirection;
}

interface ProcessStep {
  id: string;
  phase: string;
  text: string;
  kind: "status" | "reasoning";
  at: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  proposals?: GenieProposal[];
  products?: GenieStoreProductPreview[];
  workorders?: GenieWorkorderCardsPayload;
  status?: string;
  statusPhase?: string;
  reasoningSummary?: string;
  processSteps?: ProcessStep[];
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  rawDebugLogs?: GenieRawDebugLogEntry[];
  isStreaming?: boolean;
  error?: string;
}

interface SavedHomeV2Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface QueuedPrompt {
  id: string;
  text: string;
}

const HISTORY_STORAGE_KEY = "homev2-genie-conversations";
const APP_HEADER_OFFSET_PX = 57;

const THINKING_SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #a3a3a3 0%, #a3a3a3 38%, #525252 50%, #a3a3a3 62%, #a3a3a3 100%)",
  backgroundSize: "220% 100%",
};

const PHASE_LABELS: Record<string, string> = {
  planning: "Planning",
  thinking: "Thinking",
  web_search: "Searching web",
  web_search_done: "Web search done",
  lightspeed_sales: "Sales",
  lightspeed_inventory: "Stock",
  lightspeed_customers: "Customers",
  rechecking: "Retrying",
  responding: "Answering",
  tool: "Working",
};

function normalizeStartupStatusText(text: string, phase?: string): string {
  return compactGenieProgressText(text, phase);
}

function processTimestamp(): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function processStepId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createProcessStep(
  phase: string,
  text: string,
  kind: ProcessStep["kind"] = "status",
): ProcessStep {
  return {
    id: processStepId(),
    phase,
    text: kind === "status" ? normalizeStartupStatusText(text.trim(), phase) : text.trim(),
    kind,
    at: processTimestamp(),
  };
}

function appendProcessStep(steps: ProcessStep[] | undefined, step: ProcessStep): ProcessStep[] {
  if (!step.text) return steps ?? [];
  const current = steps ?? [];
  const last = current[current.length - 1];
  if (last?.kind === step.kind && last.phase === step.phase && last.text === step.text) return current;
  return [...current, step].slice(-80);
}

function upsertLiveReasoningStep(steps: ProcessStep[] | undefined, step: ProcessStep): ProcessStep[] {
  if (!step.text) return steps ?? [];
  const current = steps ?? [];
  const last = current[current.length - 1];
  if (last?.kind === "reasoning" && last.phase === step.phase) {
    return [...current.slice(0, -1), { ...last, text: step.text, at: step.at }];
  }
  return appendProcessStep(current, step);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(text: string) {
  const inline = (value: string) =>
    escapeHtml(value)
      .replace(/`([^`]+?)`/g, '<code class="rounded bg-background px-1 py-0.5 text-[0.85em] font-medium">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

  const lines = text.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  const isTableRow = (line: string) => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.slice(1, -1).includes("|");
  };

  const cells = (line: string) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

  const isSeparator = (line: string) => isTableRow(line) && cells(line).every((cell) => /^:?-{3,}:?$/.test(cell));

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trimStart();

    if (isTableRow(line) && lines[index + 1] && isSeparator(lines[index + 1])) {
      closeList();
      const header = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(cells(lines[index]));
        index++;
      }
      index--;
      html.push('<div class="my-3 overflow-x-auto rounded-2xl border border-border/70 bg-background/70">');
      html.push('<table class="w-full min-w-[420px] border-collapse text-sm">');
      html.push("<thead><tr>");
      for (const head of header) html.push(`<th class="border-b border-border/70 px-3 py-2 text-left font-semibold text-foreground">${inline(head)}</th>`);
      html.push("</tr></thead><tbody>");
      for (const row of rows) {
        html.push('<tr class="border-t border-border/50">');
        for (const cell of row) html.push(`<td class="px-3 py-2 align-top text-muted-foreground">${inline(cell)}</td>`);
        html.push("</tr>");
      }
      html.push("</tbody></table></div>");
      continue;
    }

    const unordered = /^[•\-*]\s+/.test(trimmed);
    const ordered = /^\d+\.\s+/.test(trimmed);

    if (unordered || ordered) {
      const nextType = ordered ? "ol" : "ul";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html.push(`<${nextType} class="my-2 space-y-1 pl-5">`);
      }
      html.push(`<li class="${ordered ? "list-decimal" : "list-disc"} leading-relaxed">${inline(trimmed.replace(/^[•\-*]\s+/, "").replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    closeList();

    if (!trimmed) {
      html.push('<div class="h-2"></div>');
    } else if (/^#{1,4}\s/.test(trimmed)) {
      html.push(`<p class="mt-3 first:mt-0 text-base font-semibold leading-tight text-foreground">${inline(trimmed.replace(/^#{1,4}\s+/, ""))}</p>`);
    } else {
      html.push(`<p class="leading-relaxed">${inline(trimmed)}</p>`);
    }
  }

  closeList();
  return html.join("");
}

function AssistantMessageContent({ content }: { content: string }) {
  if (!content) return null;

  return (
    <div className="max-w-3xl text-[15px] leading-relaxed">
      <div
        className="[&>p+p]:mt-2 [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  );
}

function formatVisualValue(value: string | number | null | undefined, format?: VisualValueFormat) {
  if (value == null || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);

  if (format === "currency" && Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  if (format === "percent" && Number.isFinite(numeric)) {
    return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(numeric)}%`;
  }

  if (Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(numeric);
  }

  return String(value);
}

function formatAxisValue(value: number, format?: VisualValueFormat) {
  if (format === "percent") {
    return `${new Intl.NumberFormat("en-AU", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)}%`;
  }

  return new Intl.NumberFormat("en-AU", {
    style: format === "currency" ? "currency" : undefined,
    currency: format === "currency" ? "AUD" : undefined,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function chartLabel(value: string) {
  return value.length > 20 ? `${value.slice(0, 19)}…` : value;
}

function compareTableValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  format?: VisualValueFormat,
) {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNumber = typeof a === "number" ? a : Number(String(a).replace(/[$,%]/g, ""));
  const bNumber = typeof b === "number" ? b : Number(String(b).replace(/[$,%]/g, ""));
  if ((format === "currency" || format === "number" || format === "percent" || (Number.isFinite(aNumber) && Number.isFinite(bNumber))) && Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return aNumber - bNumber;
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function sortedTableRows(table: GenieTablePayload, sort: TableSortState | null) {
  if (!sort) return table.rows;
  const column = table.columns.find((col) => col.key === sort.key);
  if (!column) return table.rows;

  return [...table.rows].sort((a, b) => {
    const result = compareTableValues(a[column.key], b[column.key], column.format);
    return sort.direction === "asc" ? result : -result;
  });
}

function GenieChart({ chart }: { chart: GenieChartPayload }) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const isLineChart = chart.kind === "line";
  const ChartIcon = isLineChart ? LineChartIcon : BarChart3;
  const config = chart.series.reduce<ChartConfig>((acc, series, index) => {
    acc[series.key] = {
      label: series.label,
      color: series.color ?? `var(--chart-${(index % 5) + 1})`,
    };
    return acc;
  }, {});

  const handleDownloadPng = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await downloadChartCardAsPng({
        cardEl: cardRef.current,
        title: chart.title,
        subtitle: chart.subtitle,
      });
    } catch {
      // Ignore export failures silently — chart may still be rendering.
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div ref={cardRef} className="w-full rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <ChartIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight text-foreground">{chart.title}</p>
          {chart.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{chart.subtitle}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDownloadPng}
          disabled={isExporting}
          className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label={`Download ${chart.title} as PNG`}
        >
          <Download className="h-3.5 w-3.5" />
          PNG
        </Button>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        {isLineChart ? (
          <LineChart accessibilityLayer data={chart.data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={chart.xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={chart.data.length > 7 ? "preserveStartEnd" : 0}
              tickFormatter={(value) => chartLabel(String(value))}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={58}
              tickFormatter={(value) => formatAxisValue(Number(value), chart.valueFormatter)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => String(value)}
                  formatter={(value, name) => (
                    <>
                      <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                      <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                        {formatVisualValue(Number(value), chart.valueFormatter)}
                      </span>
                    </>
                  )}
                />
              }
            />
            {chart.series.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stroke={`var(--color-${series.key})`}
                strokeWidth={2.5}
                dot={chart.data.length <= 18 ? { r: 3 } : false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        ) : (
          <BarChart accessibilityLayer data={chart.data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={chart.xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={chart.data.length > 7 ? "preserveStartEnd" : 0}
              tickFormatter={(value) => chartLabel(String(value))}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={58}
              tickFormatter={(value) => formatAxisValue(Number(value), chart.valueFormatter)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => String(value)}
                  formatter={(value, name) => (
                    <>
                      <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                      <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                        {formatVisualValue(Number(value), chart.valueFormatter)}
                      </span>
                    </>
                  )}
                />
              }
            />
            {chart.series.map((series) => (
              <Bar key={series.key} dataKey={series.key} fill={`var(--color-${series.key})`} radius={[10, 10, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ChartContainer>
    </div>
  );
}

function GenieTable({ table }: { table: GenieTablePayload }) {
  const [sort, setSort] = React.useState<TableSortState | null>(null);
  const rows = sortedTableRows(table, sort);

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const handleDownloadCsv = () => {
    downloadTableCsv({
      title: table.title,
      columns: table.columns,
      rows,
    });
  };

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm">
      <div className="flex items-start gap-2 px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Table2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight text-foreground">{table.title}</p>
          {table.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{table.subtitle}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDownloadCsv}
          className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label={`Download ${table.title} as CSV`}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
      </div>
      <div className="overflow-x-auto border-t border-border/70">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              {table.columns.map((column) => (
                <th
                  key={column.key}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === "asc" ? "ascending" : "descending"
                      : "none"
                  }
                  className={cn("border-b border-border/70 px-4 py-2 text-left font-semibold text-foreground", column.align === "right" && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      "inline-flex w-full items-center gap-1.5 rounded-sm text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30",
                      column.align === "right" ? "justify-end" : "justify-start",
                    )}
                  >
                    <span className="truncate">{column.label}</span>
                    {sort?.key === column.key ? (
                      sort.direction === "asc"
                        ? <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                        : <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-45" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-border/50">
                {table.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn("px-4 py-2 align-top text-muted-foreground", column.align === "right" && "text-right font-mono tabular-nums")}
                  >
                    {formatVisualValue(row[column.key], column.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isLightspeedStatus(status: string) {
  const text = status.toLowerCase();
  return text.includes("lightspeed") || text.includes("sales") || text.includes("inventory") || text.includes("customer");
}

function LightspeedLogoTile() {
  return (
    <span className="flex h-4 w-4 shrink-0 overflow-hidden rounded-full">
      <Image
        src="/ls.png"
        alt="Lightspeed"
        width={16}
        height={16}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function processStepLabel(step: ProcessStep) {
  if (step.kind === "reasoning") return "Reasoning";
  return PHASE_LABELS[step.phase] ?? step.phase;
}

function ProcessStepDetail({
  step,
  isLast,
  live,
}: {
  step: ProcessStep;
  isLast: boolean;
  live?: boolean;
}) {
  const lightspeed =
    step.phase === "lightspeed_sales"
    || step.phase === "lightspeed_inventory"
    || step.phase === "lightspeed_customers"
    || step.phase === "rechecking"
    || isLightspeedStatus(step.text);

  return (
    <div className="grid grid-cols-[18px_1fr] gap-2.5">
      <div className="relative flex justify-center">
        <span
          className={cn(
            "mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-300",
            live && isLast ? "animate-pulse bg-gray-500" : "",
          )}
        />
        {!isLast ? <span className="absolute top-4 bottom-0 w-px bg-gray-200" /> : null}
      </div>
      <div className="pb-3">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-gray-400">
          {lightspeed ? <LightspeedLogoTile /> : null}
          <span className="font-medium text-gray-500">{processStepLabel(step)}</span>
          <span className="text-gray-300">{step.at}</span>
        </div>
        <div
          className={cn(
            "text-xs leading-relaxed text-gray-600 [&_strong]:font-semibold [&_strong]:text-gray-800 [&_ul]:my-1.5 [&_li]:my-0.5",
            live && isLast ? "text-transparent bg-clip-text animate-[agent-text-shimmer_5.5s_linear_infinite]" : "",
          )}
          style={live && isLast ? {
            backgroundImage:
              "linear-gradient(90deg, #737373 0%, #737373 38%, #171717 50%, #737373 62%, #737373 100%)",
            backgroundSize: "220% 100%",
          } : undefined}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(step.text) }}
        />
      </div>
    </div>
  );
}

function ThinkingProgressPanel({
  open,
  onClose,
  steps,
  live,
  phaseLabel,
  analysisPlan,
  analysisQueries,
  rawDebugLogs,
}: {
  open: boolean;
  onClose: () => void;
  steps: ProcessStep[];
  live?: boolean;
  phaseLabel: string;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  rawDebugLogs?: GenieRawDebugLogEntry[];
}) {
  const [rawLogsOpen, setRawLogsOpen] = React.useState(false);
  const panelScrollRef = React.useRef<HTMLDivElement>(null);
  const latestStepText = steps[steps.length - 1]?.text;
  const logCount = rawDebugLogs?.length ?? 0;

  React.useEffect(() => {
    if (!open || !panelScrollRef.current) return;
    panelScrollRef.current.scrollTop = panelScrollRef.current.scrollHeight;
  }, [open, steps.length, latestStepText, live]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (rawLogsOpen) setRawLogsOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, rawLogsOpen]);

  React.useEffect(() => {
    if (!open) setRawLogsOpen(false);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close thinking panel"
        className="fixed inset-x-0 bottom-0 z-40 animate-in fade-in duration-200 bg-black/15"
        style={{ top: APP_HEADER_OFFSET_PX }}
        onClick={onClose}
      />
      <aside
        className="fixed z-50 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in slide-in-from-right-4 fade-in duration-300 ease-out"
        style={{
          top: APP_HEADER_OFFSET_PX + 12,
          right: 12,
          height: `calc(100svh - ${APP_HEADER_OFFSET_PX}px - 24px)`,
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {rawLogsOpen ? "Raw logs" : "Thinking & progress"}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {rawLogsOpen
                ? `${logCount} captured event${logCount === 1 ? "" : "s"}`
                : live
                  ? `${phaseLabel} · ${steps.length} step${steps.length === 1 ? "" : "s"} so far`
                  : `${steps.length} step${steps.length === 1 ? "" : "s"} recorded`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {rawLogsOpen ? (
              <button
                type="button"
                onClick={() => setRawLogsOpen(false)}
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Back
              </button>
            ) : logCount > 0 ? (
              <button
                type="button"
                onClick={() => setRawLogsOpen(true)}
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Raw logs
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={panelScrollRef}
          className={cn(
            "min-h-0 flex-1 px-4 py-4",
            rawLogsOpen ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          {rawLogsOpen ? (
            <GenieRawLogsViewer logs={rawDebugLogs ?? []} />
          ) : (
            <div className="space-y-4">
              <GenieThinkingDetailSections
                plan={analysisPlan}
                queries={analysisQueries}
                live={live}
              />
              {steps.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Progress
                  </p>
                  {steps.map((step, index) => (
                    <ProcessStepDetail
                      key={step.id}
                      step={step}
                      isLast={index === steps.length - 1}
                      live={live && index === steps.length - 1}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

function ProcessTimelineBox({
  steps,
  live,
  analysisPlan,
  analysisQueries,
  rawDebugLogs,
}: {
  steps: ProcessStep[];
  live?: boolean;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  rawDebugLogs?: GenieRawDebugLogEntry[];
}) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const visibleSteps = steps
    .filter((step) => step.phase !== "responding" && !/composing.*answer/i.test(step.text))
    .map((step) => ({
      ...step,
      text: step.kind === "status" ? normalizeStartupStatusText(step.text, step.phase) : step.text,
    }))
    .slice(-40);
  const latestStep = visibleSteps[visibleSteps.length - 1];
  const hasAnalysis = Boolean(analysisPlan?.execution_steps.length || analysisQueries?.length);

  if (visibleSteps.length === 0 && !hasAnalysis) return null;

  const phaseLabel = latestStep ? processStepLabel(latestStep) : analysisPlan ? "Planning" : "Working";
  const progressText = latestStep
    ? liveGenieProgressPreview(latestStep.text, latestStep.phase) || phaseLabel
    : "Thinking…";

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={cn(
          "w-fit max-w-3xl whitespace-normal border-0 bg-transparent p-0 text-left text-[15px] leading-relaxed text-gray-500",
          live && "text-transparent bg-clip-text animate-[agent-text-shimmer_5.5s_linear_infinite]",
          !live && "text-gray-400 hover:text-gray-600",
        )}
        style={live ? THINKING_SHIMMER_STYLE : undefined}
        aria-label="Open thinking and progress details"
      >
        {live ? progressText : "View thought process"}
      </button>

      <ThinkingProgressPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        steps={visibleSteps}
        live={live}
        phaseLabel={phaseLabel}
        analysisPlan={analysisPlan}
        analysisQueries={analysisQueries}
        rawDebugLogs={rawDebugLogs}
      />
    </>
  );
}

function readConversationHistory(): SavedHomeV2Conversation[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeConversationHistory(conversations: SavedHomeV2Conversation[]) {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(conversations.slice(0, 20)));
}

function conversationTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUser) return "New conversation";
  return firstUser.length > 58 ? `${firstUser.slice(0, 57)}…` : firstUser;
}

function conversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function PromptQueueList({
  items,
  onUpdate,
  onDelete,
}: {
  items: QueuedPrompt[];
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  if (items.length === 0) return null;

  const startEditing = (item: QueuedPrompt) => {
    setEditingId(item.id);
    setDraft(item.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmed = draft.trim();
    if (trimmed) onUpdate(editingId, trimmed);
    setEditingId(null);
    setDraft("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  return (
    <div className="mb-2 max-h-28 space-y-1 overflow-y-auto">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2"
        >
          {editingId === item.id ? (
            <>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveEdit();
                  }
                  if (event.key === "Escape") cancelEdit();
                }}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={saveEdit}
                disabled={!draft.trim()}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Cancel edit"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 truncate text-sm text-gray-800">{item.text}</p>
              <button
                type="button"
                onClick={() => startEditing(item)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Edit queued prompt"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Delete queued prompt"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function HomeV2Chat({ todayLabel }: { todayLabel: string }) {
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversations, setConversations] = React.useState<SavedHomeV2Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [queuedPrompts, setQueuedPrompts] = React.useState<QueuedPrompt[]>([]);
  const [lastMsgMinHeight, setLastMsgMinHeight] = React.useState<number | undefined>(undefined);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const lastUserMessageRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const messagesRef = React.useRef<ChatMessage[]>([]);
  const isLoadingRef = React.useRef(false);
  const runSendRef = React.useRef<(text: string, clearInputField?: boolean) => Promise<void>>(async () => {});
  const consumedPendingPromptRef = React.useRef(false);
  const hasStarted = messages.length > 0;

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const clearPromptQueue = React.useCallback(() => {
    setQueuedPrompts([]);
  }, []);

  const updateQueuedPrompt = React.useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQueuedPrompts((current) =>
      current.map((item) => (item.id === id ? { ...item, text: trimmed } : item)),
    );
  }, []);

  const deleteQueuedPrompt = React.useCallback((id: string) => {
    setQueuedPrompts((current) => current.filter((item) => item.id !== id));
  }, []);

  const processPromptQueue = React.useCallback(() => {
    setQueuedPrompts((current) => {
      if (current.length === 0) return current;
      const [next, ...rest] = current;
      queueMicrotask(() => {
        void runSendRef.current(next.text, false);
      });
      return rest;
    });
  }, []);

  React.useEffect(() => {
    setConversations(readConversationHistory());
  }, []);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  React.useEffect(() => {
    if (messages.length === 0 || messages.some((message) => message.isStreaming)) return;
    if (!messages.some((message) => message.role === "user")) return;

    const id = activeConversationId ?? crypto.randomUUID();
    const nextConversation: SavedHomeV2Conversation = {
      id,
      title: conversationTitle(messages),
      updatedAt: new Date().toISOString(),
      messages,
    };

    setActiveConversationId(id);
    setConversations((current) => {
      const next = [nextConversation, ...current.filter((conversation) => conversation.id !== id)].slice(0, 20);
      writeConversationHistory(next);
      return next;
    });
  }, [activeConversationId, messages]);

  const startNewChat = React.useCallback(() => {
    abortRef.current?.abort();
    clearPromptQueue();
    setInput("");
    setMessages([]);
    setLastMsgMinHeight(undefined);
    setActiveConversationId(null);
    setHistoryOpen(false);
    isLoadingRef.current = false;
    setIsLoading(false);
  }, [clearPromptQueue]);

  const loadConversation = React.useCallback((conversation: SavedHomeV2Conversation) => {
    abortRef.current?.abort();
    clearPromptQueue();
    setInput("");
    setMessages(conversation.messages.map((message) => ({ ...message, isStreaming: false, status: undefined })));
    setLastMsgMinHeight(undefined);
    setActiveConversationId(conversation.id);
    setHistoryOpen(false);
    isLoadingRef.current = false;
    setIsLoading(false);
  }, [clearPromptQueue]);

  const stopGeneration = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runSend = React.useCallback(async (text: string, clearInputField = true) => {
    const trimmed = text.trim();
    if (!trimmed || isLoadingRef.current) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      status: "Thinking",
      statusPhase: "thinking",
      processSteps: [createProcessStep("thinking", "Thinking")],
    };

    const nextMessages = [...messagesRef.current, userMessage];
    const containerHeight =
      scrollRef.current?.clientHeight ??
      (typeof window === "undefined" ? 0 : Math.max(360, window.innerHeight - 180));

    flushSync(() => {
      const updatedMessages = [...nextMessages, assistantMessage];
      messagesRef.current = updatedMessages;
      setLastMsgMinHeight(containerHeight);
      setMessages(updatedMessages);
      if (clearInputField) setInput("");
    });
    isLoadingRef.current = true;
    setIsLoading(true);

    const snapLatestUserToTop = () => {
      const container = scrollRef.current;
      const element = lastUserMessageRef.current;
      if (!container || !element) return;

      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + (elementRect.top - containerRect.top) - 12,
        behavior: "smooth",
      });
    };

    snapLatestUserToTop();
    requestAnimationFrame(snapLatestUserToTop);

    const controller = new AbortController();
    abortRef.current = controller;

    const streamState = { pending: "", rafId: null as number | null };
    const flushText = () => {
      if (streamState.pending) {
        const chunk = streamState.pending;
        streamState.pending = "";
        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? { ...message, content: `${message.content}${chunk}`, status: undefined }
            : message
        ));
      }
      streamState.rafId = null;
    };
    const queueTextDelta = (text: string) => {
      if (!text) return;
      streamState.pending += text;
      if (streamState.rafId === null) {
        streamState.rafId = requestAnimationFrame(flushText);
      }
    };
    const flushPendingText = () => {
      if (streamState.rafId !== null) {
        cancelAnimationFrame(streamState.rafId);
        flushText();
      }
    };

    const recordStreamEvent = (payload: Record<string, unknown>) => {
      setMessages((current) => current.map((message) =>
        message.id === assistantId
          ? { ...message, rawDebugLogs: appendRawDebugLog(message.rawDebugLogs, payload) }
          : message
      ));
    };

    try {
      const response = await fetch("/api/genie/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      recordStreamEvent({
        event: "_stream_start",
        endpoint: "/api/genie/agent",
        user_message: trimmed,
        request_messages_count: nextMessages.length,
        http_status: response.status,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw);
          } catch {
            recordStreamEvent({ event: "_sse_parse_error", raw });
            continue;
          }

          recordStreamEvent(event);

          if (event.event === "status") {
            const phase = String(event.phase ?? "tool");
            const text = normalizeStartupStatusText(String(event.text ?? "Working"), phase);
            const step = createProcessStep(phase, text);
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    status: text,
                    statusPhase: phase,
                    processSteps: appendProcessStep(message.processSteps, step),
                  }
                : message
            ));
          }

          if (event.event === "heartbeat") {
            const text = normalizeStartupStatusText(String(event.text ?? "Still working"), "thinking");
            setMessages((current) => current.map((message) =>
              message.id === assistantId && message.isStreaming
                ? {
                    ...message,
                    status: text,
                    statusPhase: "thinking",
                  }
                : message
            ));
          }

          if (event.event === "reasoning_delta") {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? (() => {
                    const reasoningSummary = `${message.reasoningSummary ?? ""}${event.text ?? ""}`;
                    return {
                      ...message,
                      reasoningSummary,
                      processSteps: upsertLiveReasoningStep(
                        message.processSteps,
                        createProcessStep("thinking", reasoningSummary, "reasoning"),
                      ),
                    };
                  })()
                : message
            ));
          }

          if (event.event === "reasoning_done") {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? (() => {
                    const reasoningSummary = String(event.text ?? message.reasoningSummary ?? "");
                    const phase = reasoningSummary.trim().startsWith("- ") ? "planning" : "thinking";
                    return {
                      ...message,
                      reasoningSummary,
                      processSteps: upsertLiveReasoningStep(
                        message.processSteps,
                        createProcessStep(phase, reasoningSummary, "reasoning"),
                      ),
                    };
                  })()
                : message
            ));
          }

          if (event.event === "analysis_plan" && event.plan) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    analysisPlan: mergeAnalysisPlan(
                      message.analysisPlan,
                      event.plan as GenieAnalysisPlanPayload,
                    ),
                  }
                : message
            ));
          }

          if (event.event === "analysis_query" && event.query) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    analysisQueries: upsertAnalysisQuery(
                      message.analysisQueries,
                      event.query as GenieAnalysisQueryPayload,
                    ),
                  }
                : message
            ));
          }

          if (event.event === "text_delta") {
            queueTextDelta(String(event.text ?? ""));
          }

          if (event.event === "chart" && event.chart) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? { ...message, charts: [...(message.charts ?? []), event.chart as GenieChartPayload] }
                : message
            ));
          }

          if (event.event === "table" && event.table) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? { ...message, tables: [...(message.tables ?? []), event.table as GenieTablePayload] }
                : message
            ));
          }

          if (event.event === "proposal" && event.proposal) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    proposals: [...(message.proposals ?? []), event.proposal as GenieProposal],
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "products" && Array.isArray(event.products) && event.products.length > 0) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    products: event.products as GenieStoreProductPreview[],
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "workorders" && event.workorders) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    workorders: event.workorders as GenieWorkorderCardsPayload,
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "done") {
            flushPendingText();
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, isStreaming: false, status: undefined } : message
            ));
          }

          if (event.event === "error") {
            throw new Error(typeof event.message === "string" ? event.message : "Genie failed");
          }
        }
      }

      flushPendingText();
      recordStreamEvent({ event: "_stream_end" });
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, isStreaming: false, status: undefined } : message
      ));
    } catch (error) {
      if (streamState.rafId !== null) {
        cancelAnimationFrame(streamState.rafId);
        streamState.rafId = null;
      }
      if ((error as Error).name === "AbortError") {
        recordStreamEvent({ event: "_stream_aborted" });
        flushPendingText();
        setMessages((current) => current.map((message) =>
          message.isStreaming ? { ...message, isStreaming: false, status: undefined } : message
        ));
      } else {
        recordStreamEvent({
          event: "_stream_error",
          message: error instanceof Error ? error.message : String(error),
        });
        flushPendingText();
        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                isStreaming: false,
                status: undefined,
                error: "Something went wrong. Please try again.",
              }
            : message
        ));
      }
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
      abortRef.current = null;
      flushSync(() => {
        setMessages((current) => {
          messagesRef.current = current;
          return current;
        });
      });
      processPromptQueue();
    }
  }, [processPromptQueue]);

  React.useEffect(() => {
    runSendRef.current = runSend;
  }, [runSend]);

  React.useEffect(() => {
    if (consumedPendingPromptRef.current) return;
    const pending = consumeHomeV2PendingPrompt();
    if (!pending) return;
    consumedPendingPromptRef.current = true;
    queueMicrotask(() => {
      void runSendRef.current(pending, false);
    });
  }, []);

  const submitPrompt = React.useCallback((rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text) return;

    if (isLoadingRef.current) {
      setQueuedPrompts((current) => [...current, { id: crypto.randomUUID(), text }]);
      if (rawText === undefined) setInput("");
      return;
    }

    void runSend(text, rawText === undefined);
  }, [input, runSend]);

  return (
    <div className="flex h-[calc(100svh-57px)] flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
      {!hasStarted ? (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-7 px-6 py-10">
          <h1 className="max-w-2xl text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Welcome, today is {todayLabel}
          </h1>

          <HomeV2MetricsCards />

          <div className="w-full">
            <PromptQueueList
              items={queuedPrompts}
              onUpdate={updateQueuedPrompt}
              onDelete={deleteQueuedPrompt}
            />
            <HomeV2ChatInput
              value={input}
              isRunning={isLoading}
              onChange={setInput}
              onSubmit={() => submitPrompt()}
              onStop={stopGeneration}
            />
          </div>

          <div className="w-full">
            <HomeV2SmartSuggestions />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              {messages.map((message, index) => {
                const isLatestUserMessage =
                  message.role === "user" &&
                  !messages.slice(index + 1).some((nextMessage) => nextMessage.role === "user");
                const isLastMessage = index === messages.length - 1;

                return (
                  <div
                    key={message.id}
                    ref={isLatestUserMessage ? lastUserMessageRef : undefined}
                    style={isLastMessage && lastMsgMinHeight ? { minHeight: lastMsgMinHeight } : undefined}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
	                    {message.role === "assistant" ? (
	                      <div className="w-full max-w-none text-sm text-foreground">
	                        <div className="space-y-4">
		                          {message.processSteps?.length
                            || message.analysisPlan?.execution_steps.length
                            || message.analysisQueries?.length
                            || message.rawDebugLogs?.length ? (
		                            <ProcessTimelineBox
                                steps={message.processSteps ?? []}
                                live={message.isStreaming}
                                analysisPlan={message.analysisPlan}
                                analysisQueries={message.analysisQueries}
                                rawDebugLogs={message.rawDebugLogs}
                              />
		                          ) : null}
	                          {message.products?.length ? (
	                            <GenieStoreProductCards products={message.products} />
	                          ) : null}
	                          {message.workorders?.workorders.length ? (
	                            <LightspeedWorkorderCards payload={message.workorders} fullWidth />
	                          ) : null}
	                          {message.charts?.map((chart, index) => <GenieChart key={`${chart.title}-${index}`} chart={chart} />)}
	                          {message.tables?.map((table, index) => <GenieTable key={`${table.title}-${index}`} table={table} />)}
	                          <AssistantMessageContent content={message.content} />
	                          {!message.isStreaming
	                            ? message.proposals?.map((proposal, proposalIndex) => (
	                                <GenieProposalCard key={`${proposal.kind}-${proposalIndex}`} proposal={proposal} />
	                              ))
	                            : null}
	                        </div>
                        {message.error && (
                          <p className="mt-2 text-sm font-medium text-destructive">{message.error}</p>
                        )}
                      </div>
                    ) : (
                      <div className="max-w-[86%] rounded-[24px] bg-primary px-4 py-2 text-sm leading-snug text-primary-foreground shadow-sm sm:max-w-[78%]">
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent px-5 pb-4 pt-6">
            <div className="mx-auto w-full max-w-3xl">
              {historyOpen ? (
                <div className="mb-3 max-h-52 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                  {conversations.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground">No conversation history yet.</p>
                  ) : (
                    <div className="grid gap-2">
                      {conversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => loadConversation(conversation)}
                          className={cn(
                            "rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-gray-300 hover:bg-gray-50",
                            activeConversationId === conversation.id && "border-gray-400 bg-gray-50",
                          )}
                        >
                          <p className="line-clamp-1 text-sm font-medium text-foreground">{conversation.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{conversationTime(conversation.updatedAt)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mb-2 flex items-center justify-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startNewChat}
                  className="h-8 rounded-full px-3 text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setHistoryOpen((open) => !open)}
                  className={cn(
                    "h-8 w-8 rounded-full text-muted-foreground hover:text-foreground",
                    historyOpen && "bg-gray-100 text-foreground",
                  )}
                  aria-label="Conversation history"
                >
                  <History className="h-4 w-4" />
                </Button>
              </div>

              <PromptQueueList
                items={queuedPrompts}
                onUpdate={updateQueuedPrompt}
                onDelete={deleteQueuedPrompt}
              />

              <HomeV2ChatInput
                compact
                value={input}
                isRunning={isLoading}
                onChange={setInput}
                onSubmit={() => submitPrompt()}
                onStop={stopGeneration}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
