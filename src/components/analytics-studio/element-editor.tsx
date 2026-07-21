"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Eye,
  LayoutGrid,
  LineChart,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  TrendingUp,
  Type,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { mutate as swrMutate } from "swr";
import type { VisualDateFormat } from "@/lib/genie/visual-format";
import { DateOptionsMenu, FieldOptionsMenu } from "./date-options-menu";
import { DesignFormatControls } from "./design-format-controls";
import { FilterRow } from "./filter-row";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  analyticsSourceFromApiTable,
  getAnalyticsColumn,
  isCustomAnalyticsSource,
  parseCustomAnalyticsTableId,
  type AnalyticsColumn,
  type AnalyticsColumnType,
  type AnalyticsSource,
  type AnalyticsSourceKey,
} from "@/lib/analytics-studio/catalog";
import { measureToFormula } from "@/lib/analytics-studio/formula";
import { createClient } from "@/lib/supabase/client";
import { runApiBuilderSyncLoop } from "@/lib/table-builder";
import type { SavedApiTable } from "@/lib/table-builder/types";
import {
  dimensionAlias,
  measureAlias,
  type AnalyticsConditionalFormat,
  type AnalyticsDimension,
  type AnalyticsFormatPalette,
  type AnalyticsFormatRuleOp,
  type AnalyticsTextConfig,
  type AnalyticsVizType,
  type AnalyticsWorkbookElement,
} from "@/lib/analytics-studio/types";
import { Textarea } from "@/components/ui/textarea";
import { buildElementSql } from "@/lib/analytics-studio/sql-builder";
import { measureLabel } from "@/lib/analytics-studio/payload";
import {
  FILTER_OPS_BY_TYPE,
  VIZ_LABELS,
} from "./constants";

export const VIZ_ICONS: Record<AnalyticsVizType, React.ComponentType<{ className?: string }>> = {
  table: Table2,
  pivot: LayoutGrid,
  bar: BarChart3,
  line: LineChart,
  metric: TrendingUp,
  text: Type,
};

function createFilterId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const SOURCE_SYNC_CHUNK_PAGES = 2;

function formatSourceSyncedAt(iso: string | null | undefined): string {
  if (!iso) return "Never synced";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never synced";
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ---------- small building blocks (Sigma-style) ---------- */

function ColumnTypeIcon({ type }: { type: AnalyticsColumnType }) {
  if (type === "date") return <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />;
  return (
    <span className="w-6 shrink-0 text-center font-mono text-[9px] font-medium leading-none text-gray-400">
      {type === "number" ? "123" : type === "boolean" ? "Y/N" : "ABC"}
    </span>
  );
}

function Section({
  label,
  action,
  children,
  hint,
}: {
  label: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border-b border-gray-100 px-3 py-1.5">
      <div className="flex h-5 items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {action}
      </div>
      {children ? <div className="mt-0.5 space-y-0">{children}</div> : null}
      {!children && hint ? (
        <p className="mt-1 rounded-md border border-dashed border-gray-200 px-2 py-1.5 text-[11px] text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AddMenu({
  options,
  onAdd,
  label,
}: {
  options: AnalyticsColumn[];
  onAdd: (key: string) => void;
  label: string;
}) {
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-gray-400 hover:text-gray-700"
          aria-label={label}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem key={option.key} onClick={() => onAdd(option.key)} className="gap-2 text-xs">
            <ColumnTypeIcon type={option.type} />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ItemRow({
  icon,
  children,
  onRemove,
  extra,
  actions,
  selected,
  onSelect,
  showRemove = true,
  draggable = false,
  dragging = false,
  dropTarget = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onRemove: () => void;
  extra?: React.ReactNode;
  /** Always-visible quick actions (shown before remove). */
  actions?: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  showRemove?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  const suppressClickRef = React.useRef(false);

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      draggable={draggable}
      onDragStart={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, input, [data-no-drag]")) {
          event.preventDefault();
          return;
        }
        suppressClickRef.current = false;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "reorder");
        onDragStart?.(event);
      }}
      onDragOver={(event) => {
        if (!draggable && !onDragOver) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver?.(event);
      }}
      onDrop={(event) => {
        event.preventDefault();
        suppressClickRef.current = true;
        onDrop?.(event);
      }}
      onDragEnd={(event) => {
        onDragEnd?.(event);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }}
      onClick={() => {
        if (suppressClickRef.current) return;
        onSelect?.();
      }}
      onKeyDown={
        onSelect
          ? (event) => {
              const target = event.target as HTMLElement | null;
              // Don't steal Space/Enter from rename inputs (or other form fields).
              if (target?.closest("input, textarea, select, [contenteditable='true']")) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cn(
        "group flex h-6 items-center gap-1 rounded-md px-1",
        selected || dropTarget ? "bg-gray-50" : "hover:bg-gray-50",
        onSelect && !draggable && "cursor-pointer",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      {icon}
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
      {extra}
      {actions ? (
        <div
          data-no-drag
          className="flex shrink-0 items-center gap-0.5"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
      {showRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-no-drag
          className={cn(
            "shrink-0 text-gray-400 transition-opacity hover:text-gray-700",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
          title="Remove"
        >
          <X className="h-3 w-3" />
        </Button>
      ) : null}
    </div>
  );
}

function MoveFieldButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-gray-300 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100"
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <ArrowUpDown className="h-3 w-3" />
    </Button>
  );
}

/** The movable Sigma-style Values container (drag anywhere onto rows/columns). */
function ValuesChip({
  count,
  from,
  onMove,
  moveLabel,
  dragging,
  onDragStart,
  onDragEnd,
  addOptions,
  onAdd,
  canAdd,
}: {
  count: number;
  from: "rows" | "columns";
  onMove: () => void;
  moveLabel: string;
  dragging?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
  addOptions?: AnalyticsColumn[];
  onAdd?: (key: string) => void;
  canAdd?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, input, [data-no-drag]")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/x-analytics-pivot-values",
          JSON.stringify({ from }),
        );
        event.dataTransfer.setData("text/plain", "values");
        onDragStart?.(event);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex h-6 cursor-grab items-center gap-1 rounded-md border border-dashed border-gray-300 bg-gray-50/80 px-1.5 active:cursor-grabbing",
        dragging && "opacity-50",
      )}
      title="Drag to Pivot rows or Pivot columns"
    >
      <span className="w-6 shrink-0 text-center font-mono text-[9px] font-medium leading-none text-gray-400">
        123
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium italic text-gray-600">
        Values ({count})
      </span>
      {canAdd && addOptions && onAdd ? (
        <span data-no-drag className="contents">
          <AddMenu label="Add value" options={addOptions} onAdd={onAdd} />
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-gray-400 hover:text-gray-700"
        onClick={onMove}
        title={moveLabel}
        aria-label={moveLabel}
      >
        <ArrowUpDown className="h-3 w-3" />
      </Button>
    </div>
  );
}

const BARE_TRIGGER =
  "h-6 w-auto max-w-full gap-1 truncate border-none bg-transparent px-1 text-xs font-medium text-gray-700 shadow-none hover:bg-gray-100 focus:ring-0";

/* ---------- conditional formatting (pivot) ---------- */

const FORMAT_PALETTES: Array<{ value: AnalyticsFormatPalette; label: string; swatch: string }> = [
  { value: "green", label: "Green", swatch: "rgb(16,185,129)" },
  { value: "red", label: "Red", swatch: "rgb(239,68,68)" },
  { value: "amber", label: "Amber", swatch: "rgb(245,158,11)" },
  { value: "blue", label: "Blue", swatch: "rgb(59,130,246)" },
];

const NUMBER_RULE_OPS: Array<{ value: AnalyticsFormatRuleOp; label: string }> = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
];

const TEXT_RULE_OPS: Array<{ value: AnalyticsFormatRuleOp; label: string }> = [
  { value: "contains", label: "contains" },
  { value: "eq", label: "is" },
];

const FORMAT_KIND_OPTIONS: Array<{ value: AnalyticsConditionalFormat["kind"]; label: string }> = [
  { value: "rule", label: "Single colour" },
  { value: "scale", label: "Colour scale" },
  { value: "bars", label: "Data bars" },
];

function PaletteSwatch({ palette }: { palette: AnalyticsFormatPalette }) {
  const swatch = FORMAT_PALETTES.find((option) => option.value === palette)?.swatch;
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: swatch }}
    />
  );
}

interface FormatTarget {
  value: string;
  label: string;
  isMeasure: boolean;
}

function FormatRuleRow({
  rule,
  target,
  onChange,
  onRemove,
}: {
  rule: AnalyticsConditionalFormat;
  target: FormatTarget | undefined;
  onChange: (next: AnalyticsConditionalFormat) => void;
  onRemove: () => void;
}) {
  const isMeasure = target?.isMeasure ?? true;
  const ops = isMeasure ? NUMBER_RULE_OPS : TEXT_RULE_OPS;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-1.5">
      <div className="flex items-center gap-1.5">
        <PaletteSwatch palette={rule.palette} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
          {target?.label ?? rule.target}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-gray-400 hover:text-gray-700"
          onClick={onRemove}
          aria-label="Remove formatting rule"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <Select
          value={rule.kind}
          onValueChange={(value) => {
            const kind = value as AnalyticsConditionalFormat["kind"];
            onChange({
              ...rule,
              kind,
              ...(kind === "rule" && !rule.op
                ? { op: isMeasure ? ("gt" as const) : ("contains" as const), value: "" }
                : {}),
            });
          }}
        >
          <SelectTrigger className={cn(BARE_TRIGGER, "shrink-0 text-[11px] text-gray-500")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(isMeasure ? FORMAT_KIND_OPTIONS : FORMAT_KIND_OPTIONS.slice(0, 1)).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={rule.palette}
          onValueChange={(value) =>
            onChange({ ...rule, palette: value as AnalyticsFormatPalette })
          }
        >
          <SelectTrigger className={cn(BARE_TRIGGER, "shrink-0 text-[11px] text-gray-500")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_PALETTES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-1.5">
                  <PaletteSwatch palette={option.value} />
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rule.kind === "rule" ? (
          <>
            <Select
              value={rule.op ?? ops[0].value}
              onValueChange={(value) =>
                onChange({ ...rule, op: value as AnalyticsFormatRuleOp })
              }
            >
              <SelectTrigger className={cn(BARE_TRIGGER, "shrink-0 text-[11px] text-gray-500")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type={isMeasure ? "number" : "text"}
              value={rule.value ?? ""}
              onChange={(event) => onChange({ ...rule, value: event.target.value })}
              placeholder="Value"
              className="h-6 min-w-0 flex-1 px-1.5 text-xs"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- main editor ---------- */

export function ElementEditor({
  element,
  onChange,
  selectedMeasureIndex = null,
  onSelectMeasure,
}: {
  element: AnalyticsWorkbookElement;
  onChange: (patch: Partial<AnalyticsWorkbookElement>) => void;
  selectedMeasureIndex?: number | null;
  onSelectMeasure?: (index: number | null) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"properties" | "format">("properties");
  const [columnSearch, setColumnSearch] = React.useState("");
  const [customSources, setCustomSources] = React.useState<AnalyticsSource[]>([]);
  const [sourceSyncing, setSourceSyncing] = React.useState(false);
  const [sourceSyncMessage, setSourceSyncMessage] = React.useState<string | null>(null);
  const sourceSyncLoopId = React.useRef(0);
  const [pivotDrag, setPivotDrag] = React.useState<{
    key: string;
    from: "rows" | "columns";
  } | null>(null);
  const [valuesDragFrom, setValuesDragFrom] = React.useState<"rows" | "columns" | null>(null);
  const [pivotDropTarget, setPivotDropTarget] = React.useState<"rows" | "columns" | null>(null);
  const [pivotDropIndex, setPivotDropIndex] = React.useState<number | null>(null);
  const [measureDragIndex, setMeasureDragIndex] = React.useState<number | null>(null);
  const [measureDropIndex, setMeasureDropIndex] = React.useState<number | null>(null);
  const supabase = React.useMemo(() => createClient(), []);

  const loadCustomSources = React.useCallback(async () => {
    const [{ data }, { data: sourceState }] = await Promise.all([
      supabase
        .from("api_builder_tables")
        .select(
          "id, user_id, name, source, grain, columns, column_labels, calculated_columns, created_at, updated_at, last_synced_at, sync_row_count, sync_status, sync_error",
        )
        .eq("source", "sales")
        .order("updated_at", { ascending: false }),
      supabase
        .from("api_builder_source_state")
        .select("sync_status, sync_row_count, last_synced_at, sync_error")
        .eq("source", "sales")
        .maybeSingle(),
    ]);
    // Tables project over the shared raw store — availability follows it.
    const storeHasData =
      (sourceState?.sync_row_count ?? 0) > 0
      || sourceState?.sync_status === "ready"
      || sourceState?.sync_status === "syncing";
    const syncInfo = sourceState
      ? {
          lastSyncedAt: sourceState.last_synced_at,
          syncStatus: sourceState.sync_status,
          syncRowCount: sourceState.sync_row_count,
          syncError: sourceState.sync_error,
        }
      : undefined;
    const sources = storeHasData
      ? ((data ?? []) as SavedApiTable[])
          .map((table) => analyticsSourceFromApiTable(table, syncInfo))
          .filter((item) => item.columns.length > 0)
      : [];
    setCustomSources(sources);
    return sources;
  }, [supabase]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadCustomSources();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCustomSources]);

  const { query } = element;
  const sourceOptions = customSources;
  const source =
    customSources.find((item) => item.key === query.source)
    ?? ({
      key: query.source,
      label: "Select a table",
      description: "",
      view: "",
      columns: [],
    } satisfies AnalyticsSource);
  const isPivot = element.viz === "pivot";
  const isMetric = element.viz === "metric";
  const isText = element.viz === "text";
  const isRawTable = element.viz === "table" && query.mode === "raw";
  const activeTableId =
    parseCustomAnalyticsTableId(query.source) ?? source.customTableId ?? null;

  const updateQuery = (patch: Partial<AnalyticsWorkbookElement["query"]>) =>
    onChange({ query: { ...query, ...patch } });

  const patchSourceSync = React.useCallback(
    (
      _tableId: string,
      patch: Partial<
        Pick<AnalyticsSource, "lastSyncedAt" | "syncStatus" | "syncRowCount" | "syncError">
      >,
    ) => {
      // Sync state describes the shared raw store — every source shows it.
      setCustomSources((previous) =>
        previous.map((item) => ({ ...item, ...patch })),
      );
    },
    [],
  );

  const refreshSource = React.useCallback(async () => {
    if (!activeTableId || sourceSyncing) return;
    const sourceKey = query.source;
    const loopId = ++sourceSyncLoopId.current;
    setSourceSyncing(true);
    setSourceSyncMessage("Refreshing from Lightspeed…");
    patchSourceSync(activeTableId, {
      syncStatus: "syncing",
      syncError: null,
    });

    // Incremental refresh: pulls only sales since the last sync, unless the
    // table schema changed in Build a Table (then the server rebuilds fully).
    const result = await runApiBuilderSyncLoop({
      tableId: activeTableId,
      maxPages: SOURCE_SYNC_CHUNK_PAGES,
      mode: "auto",
      shouldContinue: () => sourceSyncLoopId.current === loopId,
      onProgress: (message, chunk) => {
        if (sourceSyncLoopId.current !== loopId) return;
        if (chunk.throttled) {
          setSourceSyncMessage(message);
          patchSourceSync(activeTableId, {
            syncStatus: "syncing",
            syncError: null,
          });
          return;
        }
        patchSourceSync(activeTableId, {
          syncStatus: chunk.complete ? "ready" : "syncing",
          syncRowCount: chunk.rowsUpserted ?? null,
          lastSyncedAt: new Date().toISOString(),
          syncError: null,
        });
        setSourceSyncMessage(chunk.complete ? null : message);
      },
    });

    if (sourceSyncLoopId.current !== loopId) return;

    if (!result.ok) {
      patchSourceSync(activeTableId, {
        syncStatus: "error",
        syncError: result.error,
      });
      setSourceSyncMessage(result.error);
      await loadCustomSources();
      setSourceSyncing(false);
      return;
    }

    await loadCustomSources();
    // The shared store backs every custom source — refresh them all.
    await swrMutate(
      (key) =>
        typeof key === "string"
        && (key.includes(`"source":"${sourceKey}"`) || key.includes('"source":"custom_')),
      undefined,
      { revalidate: true },
    );
    setSourceSyncMessage(null);
    setSourceSyncing(false);
  }, [
    activeTableId,
    loadCustomSources,
    patchSourceSync,
    query.source,
    sourceSyncing,
  ]);

  const dimensionOptions = source.columns.filter((column) => !column.idLike);
  const numberColumns = source.columns.filter((column) => column.type === "number");
  const usedDimensionKeys = new Set(query.dimensions.map((dimension) => dimension.column));
  const availableDimensionOptions = dimensionOptions.filter(
    (option) => !usedDimensionKeys.has(option.key),
  );

  /* ----- viz switching keeps pivot config and date labels consistent ----- */
  const handleVizChange = (viz: AnalyticsVizType) => {
    if (viz === element.viz) return;
    const patch: Partial<AnalyticsWorkbookElement> = { viz };
    let nextQuery = { ...query };

    if (viz === "text") {
      if (!element.text) {
        patch.text = { content: "New title", style: "title" };
      }
      onChange(patch);
      return;
    }
    if (viz === "pivot") {
      nextQuery = {
        ...nextQuery,
        mode: "aggregate",
        dateLabels: "sortable",
        measures: nextQuery.measures.slice(0, 6),
        limit: Math.max(nextQuery.limit, 1000),
        sort: null,
      };
      if (!element.pivot || element.pivot.rows.length === 0) {
        const aliases = nextQuery.dimensions.map((dimension) => dimensionAlias(dimension));
        patch.pivot = {
          rows: aliases.slice(0, 1),
          columns: aliases.slice(1, 2),
          valuesIn: element.pivot?.valuesIn ?? "columns",
        };
      }
    } else {
      if (query.dateLabels === "sortable") nextQuery = { ...nextQuery, dateLabels: "pretty" };
      if (viz === "metric") {
        nextQuery = { ...nextQuery, mode: "aggregate", measures: nextQuery.measures.slice(0, 1) };
      }
      if (viz === "bar" || viz === "line") {
        nextQuery = { ...nextQuery, mode: "aggregate" };
      }
    }

    patch.query = nextQuery;
    onChange(patch);
  };

  /* ----- pivot row/column helpers keep query.dimensions in sync ----- */
  const pivotRows = element.pivot?.rows ?? [];
  const pivotColumns = element.pivot?.columns ?? [];
  const valuesIn = element.pivot?.valuesIn ?? "columns";

  const addPivotField = (bucket: "rows" | "columns", key: string) => {
    const column = getAnalyticsColumn(source, key);
    if (!column) return;
    const dimensions: AnalyticsDimension[] = usedDimensionKeys.has(key)
      ? query.dimensions
      : [
          ...query.dimensions,
          { column: key, truncate: column.type === "date" ? ("month" as const) : undefined },
        ];
    onChange({
      query: { ...query, dimensions },
      pivot: {
        valuesIn,
        rows: bucket === "rows" ? [...pivotRows, key] : pivotRows,
        columns: bucket === "columns" ? [...pivotColumns, key] : pivotColumns,
      },
    });
  };

  const removePivotField = (bucket: "rows" | "columns", key: string) => {
    const rows = bucket === "rows" ? pivotRows.filter((k) => k !== key) : pivotRows;
    const columns = bucket === "columns" ? pivotColumns.filter((k) => k !== key) : pivotColumns;
    onChange({
      query: {
        ...query,
        dimensions: query.dimensions.filter(
          (dimension) => rows.includes(dimension.column) || columns.includes(dimension.column),
        ),
      },
      pivot: { valuesIn, rows, columns },
    });
  };

  /** Move a field to the other pivot bucket (rows ⇄ columns). */
  const swapPivotField = (from: "rows" | "columns", key: string) => {
    const rows =
      from === "rows" ? pivotRows.filter((k) => k !== key) : [...pivotRows, key];
    const columns =
      from === "columns" ? pivotColumns.filter((k) => k !== key) : [...pivotColumns, key];
    onChange({ pivot: { valuesIn, rows, columns } });
  };

  /** Reorder within a bucket, or move across buckets to a target index. */
  const movePivotField = (
    from: "rows" | "columns",
    key: string,
    to: "rows" | "columns",
    toIndex: number,
  ) => {
    const rows = [...pivotRows];
    const columns = [...pivotColumns];
    const fromList = from === "rows" ? rows : columns;
    const toList = to === "rows" ? rows : columns;
    const fromIndex = fromList.indexOf(key);
    if (fromIndex < 0) return;

    if (from === to) {
      if (fromIndex === toIndex) return;
      const [moved] = fromList.splice(fromIndex, 1);
      if (!moved) return;
      fromList.splice(toIndex, 0, moved);
    } else {
      if (to === "rows" && rows.length >= 3) return;
      if (to === "columns" && columns.length >= 2) return;
      fromList.splice(fromIndex, 1);
      toList.splice(Math.min(Math.max(0, toIndex), toList.length), 0, key);
    }

    onChange({ pivot: { valuesIn, rows, columns } });
  };

  const canDropPivotField = (to: "rows" | "columns", key: string, from: "rows" | "columns") => {
    if (from === to) return true;
    const alreadyThere = to === "rows" ? pivotRows.includes(key) : pivotColumns.includes(key);
    if (alreadyThere) return false;
    if (to === "rows" && pivotRows.length >= 3) return false;
    if (to === "columns" && pivotColumns.length >= 2) return false;
    return true;
  };

  const handlePivotDrop = (to: "rows" | "columns", event: React.DragEvent, toIndex?: number) => {
    event.preventDefault();
    event.stopPropagation();

    // Values chip drop (rows ⇄ columns)
    let valuesFrom = valuesDragFrom;
    try {
      const rawValues = event.dataTransfer.getData("application/x-analytics-pivot-values");
      if (rawValues) {
        valuesFrom = (JSON.parse(rawValues) as { from: "rows" | "columns" }).from;
      }
    } catch {
      // keep valuesDragFrom fallback
    }
    if (valuesFrom != null) {
      setValuesDragFrom(null);
      setPivotDrag(null);
      setPivotDropTarget(null);
      setPivotDropIndex(null);
      if (valuesFrom !== to) moveValues(to);
      return;
    }

    let payload = pivotDrag;
    try {
      const raw = event.dataTransfer.getData("application/x-analytics-pivot-field");
      if (raw) payload = JSON.parse(raw) as { key: string; from: "rows" | "columns" };
    } catch {
      // keep pivotDrag fallback
    }
    const dropIndex =
      toIndex
      ?? pivotDropIndex
      ?? (to === "rows" ? pivotRows.length : pivotColumns.length);
    setPivotDrag(null);
    setValuesDragFrom(null);
    setPivotDropTarget(null);
    setPivotDropIndex(null);
    if (!payload) return;
    if (!canDropPivotField(to, payload.key, payload.from)) return;
    movePivotField(payload.from, payload.key, to, dropIndex);
  };

  /** Move the Values container between Pivot rows and Pivot columns. */
  const moveValues = (to: "rows" | "columns") => {
    onChange({ pivot: { rows: pivotRows, columns: pivotColumns, valuesIn: to } });
  };

  const setDimensionTruncate = (key: string, truncate: AnalyticsDimension["truncate"]) => {
    updateQuery({
      dimensions: query.dimensions.map((dimension) =>
        dimension.column === key ? { ...dimension, truncate } : dimension,
      ),
    });
  };

  const setDimensionDateFormat = (key: string, dateFormat: VisualDateFormat) => {
    updateQuery({
      dimensions: query.dimensions.map((dimension) =>
        dimension.column === key
          ? {
              ...dimension,
              dateFormat: dateFormat === "default" ? undefined : dateFormat,
            }
          : dimension,
      ),
    });
  };

  const setDimensionSortDir = (key: string, sortDir: "asc" | "desc") => {
    updateQuery({
      dimensions: query.dimensions.map((dimension) =>
        dimension.column === key
          ? {
              ...dimension,
              // Asc is the default; omit so saved payloads stay compact.
              sortDir: sortDir === "asc" ? undefined : sortDir,
            }
          : dimension,
      ),
      // Keep chart/table SQL order in sync with the date dimension sort.
      sort: { key, dir: sortDir },
    });
  };

  const reorderMeasures = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= query.measures.length) return;
    const next = [...query.measures];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    updateQuery({ measures: next, sort: null });

    if (selectedMeasureIndex == null) return;
    if (selectedMeasureIndex === from) {
      onSelectMeasure?.(to);
      return;
    }
    if (from < selectedMeasureIndex && to >= selectedMeasureIndex) {
      onSelectMeasure?.(selectedMeasureIndex - 1);
    } else if (from > selectedMeasureIndex && to <= selectedMeasureIndex) {
      onSelectMeasure?.(selectedMeasureIndex + 1);
    }
  };

  /* ----- generic dimension helpers (group by / x-axis) ----- */
  const addDimension = (key: string) => {
    const column = getAnalyticsColumn(source, key);
    if (!column || usedDimensionKeys.has(key)) return;
    updateQuery({
      dimensions: [
        ...query.dimensions,
        { column: key, truncate: column.type === "date" ? "month" : undefined },
      ],
    });
  };

  const removeDimension = (key: string) => {
    updateQuery({
      dimensions: query.dimensions.filter((dimension) => dimension.column !== key),
      sort: null,
    });
  };

  /* ----- measures ----- */
  const measureCap = isMetric ? 1 : isPivot ? 6 : 5;
  const addMeasure = (key: string) => {
    if (query.measures.length >= measureCap) return;
    const column = getAnalyticsColumn(source, key);
    // Sigma-style defaults: numbers sum, dates take the latest, text counts unique.
    const agg =
      column?.type === "number"
        ? ("sum" as const)
        : column?.type === "date"
          ? ("max" as const)
          : ("count_distinct" as const);
    // Allow the same column twice only when the aggregation differs.
    if (query.measures.some((measure) => measure.column === key && measure.agg === agg)) {
      return;
    }
    const nextMeasure = {
      agg,
      column: key,
      formula: measureToFormula({ agg, column: key }, source),
    };
    const next = [...query.measures, nextMeasure];
    updateQuery({ measures: next, sort: null });
    onSelectMeasure?.(next.length - 1);
  };

  /** Columns offered when adding Values — numbers first, then the rest. */
  const measureAddOptions = React.useMemo(() => {
    const rank = (column: AnalyticsColumn) =>
      column.type === "number" ? 0 : column.type === "date" ? 1 : 2;
    return [...source.columns].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }, [source.columns]);

  /* ----- bottom column list adds to the natural collection per viz ----- */
  const handleQuickAdd = (key: string) => {
    if (isRawTable) {
      if (!query.columns.includes(key)) updateQuery({ columns: [...query.columns, key] });
      return;
    }
    if (isPivot) {
      const column = getAnalyticsColumn(source, key);
      // Numbers go straight into Values so multiple metrics are easy to add.
      if (column?.type === "number" && query.measures.length < measureCap) {
        addMeasure(key);
        return;
      }
      addPivotField("rows", key);
      return;
    }
    if (isMetric) {
      const column = getAnalyticsColumn(source, key);
      const agg = column?.type === "number" ? ("sum" as const) : ("count_distinct" as const);
      updateQuery({ measures: [{ agg, column: key }], sort: null });
      return;
    }
    addDimension(key);
  };

  const filteredColumns = source.columns.filter(
    (column) =>
      !column.idLike
      && (!columnSearch.trim()
        || column.label.toLowerCase().includes(columnSearch.trim().toLowerCase())),
  );

  const sortOptions: Array<{ key: string; label: string }> = isRawTable
    ? query.columns.map((key) => ({
        key,
        label: getAnalyticsColumn(source, key)?.label ?? key,
      }))
    : [
        ...query.dimensions.map((dimension) => ({
          key: dimensionAlias(dimension),
          label: getAnalyticsColumn(source, dimension.column)?.label ?? dimension.column,
        })),
        ...query.measures.map((measure) => ({
          key: measureAlias(measure),
          label: measureLabel(element, measure),
        })),
      ];

  const { built } = buildElementSql(
    query,
    source.key === query.source ? source : undefined,
  );

  /* ----- conditional formatting targets (pivot values + row fields) ----- */
  const formatTargets: FormatTarget[] = isPivot
    ? [
        ...query.measures.map((measure) => ({
          value: measureAlias(measure),
          label: measureLabel(element, measure),
          isMeasure: true,
        })),
        ...(element.pivot?.rows ?? [])
          .filter((key) => getAnalyticsColumn(source, key))
          .map((key) => ({
            value: key,
            label: getAnalyticsColumn(source, key)!.label,
            isMeasure: false,
          })),
      ]
    : [];

  const renderDimensionRow = (key: string, onRemove: () => void, extra?: React.ReactNode) => {
    const column = getAnalyticsColumn(source, key);
    const dimension = query.dimensions.find((entry) => entry.column === key);
    if (!column) return null;
    return (
      <ItemRow
        key={key}
        icon={<ColumnTypeIcon type={column.type} />}
        onRemove={onRemove}
        showRemove={false}
        extra={extra}
        actions={
          column.type === "date" && dimension ? (
            <DateOptionsMenu
              truncate={dimension.truncate}
              dateFormat={dimension.dateFormat}
              sortDir={dimension.sortDir}
              onTruncateChange={(truncate) => setDimensionTruncate(key, truncate)}
              onDateFormatChange={(format) => setDimensionDateFormat(key, format)}
              onSortDirChange={(dir) => setDimensionSortDir(key, dir)}
              onRemove={onRemove}
            />
          ) : (
            <FieldOptionsMenu onRemove={onRemove} />
          )
        }
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
          {column.label}
        </span>
      </ItemRow>
    );
  };

  const renderPivotFieldRow = (
    bucket: "rows" | "columns",
    key: string,
    index: number,
  ) => {
    const column = getAnalyticsColumn(source, key);
    const dimension = query.dimensions.find((entry) => entry.column === key);
    if (!column) return null;
    const isDragging = pivotDrag?.key === key && pivotDrag.from === bucket;
    const isDropTarget =
      pivotDrag != null
      && !isDragging
      && pivotDropTarget === bucket
      && pivotDropIndex === index;

    const remove = () => removePivotField(bucket, key);

    return (
      <ItemRow
        key={key}
        icon={<ColumnTypeIcon type={column.type} />}
        onRemove={remove}
        showRemove={false}
        draggable
        dragging={isDragging}
        dropTarget={isDropTarget}
        onDragStart={(event) => {
          const payload = { key, from: bucket };
          setPivotDrag(payload);
          setPivotDropTarget(bucket);
          setPivotDropIndex(index);
          event.dataTransfer.setData(
            "application/x-analytics-pivot-field",
            JSON.stringify(payload),
          );
        }}
        onDragOver={() => {
          if (!pivotDrag) return;
          if (!canDropPivotField(bucket, pivotDrag.key, pivotDrag.from)) return;
          setPivotDropTarget(bucket);
          setPivotDropIndex(index);
        }}
        onDrop={(event) => handlePivotDrop(bucket, event, index)}
        onDragEnd={() => {
          setPivotDrag(null);
          setPivotDropTarget(null);
          setPivotDropIndex(null);
        }}
        extra={
          <MoveFieldButton
            title={bucket === "rows" ? "Move to Pivot columns" : "Move to Pivot rows"}
            onClick={() => swapPivotField(bucket, key)}
          />
        }
        actions={
          column.type === "date" && dimension ? (
            <DateOptionsMenu
              truncate={dimension.truncate}
              dateFormat={dimension.dateFormat}
              sortDir={dimension.sortDir}
              onTruncateChange={(truncate) => setDimensionTruncate(key, truncate)}
              onDateFormatChange={(format) => setDimensionDateFormat(key, format)}
              onSortDirChange={(dir) => setDimensionSortDir(key, dir)}
              onRemove={remove}
            />
          ) : (
            <FieldOptionsMenu onRemove={remove} />
          )
        }
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
          {column.label}
        </span>
      </ItemRow>
    );
  };

  const renderPivotDropZone = (
    bucket: "rows" | "columns",
    fields: string[],
    emptyHint: string,
    valuesChip: React.ReactNode,
  ) => {
    const valuesDropAllowed = valuesDragFrom != null && valuesDragFrom !== bucket;
    const fieldDropAllowed =
      pivotDrag != null && canDropPivotField(bucket, pivotDrag.key, pivotDrag.from);
    const isDropHighlight =
      pivotDropTarget === bucket
      && (valuesDropAllowed || (fieldDropAllowed && pivotDropIndex === fields.length));

    return (
      <div
        onDragOver={(event) => {
          if (valuesDragFrom != null) {
            if (!valuesDropAllowed) {
              event.dataTransfer.dropEffect = "none";
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (pivotDropTarget !== bucket) setPivotDropTarget(bucket);
            return;
          }
          if (!pivotDrag) return;
          if (!fieldDropAllowed) {
            event.dataTransfer.dropEffect = "none";
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (pivotDropTarget !== bucket) setPivotDropTarget(bucket);
          if (pivotDropIndex !== fields.length) setPivotDropIndex(fields.length);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setPivotDropTarget((current) => (current === bucket ? null : current));
          setPivotDropIndex(null);
        }}
        onDrop={(event) => handlePivotDrop(bucket, event, fields.length)}
        className={cn(
          "mt-0 min-h-[24px] space-y-0 rounded-md transition-colors",
          isDropHighlight && "bg-gray-50 ring-1 ring-inset ring-gray-200",
        )}
      >
        {fields.map((key, index) => renderPivotFieldRow(bucket, key, index))}
        {valuesChip}
        {fields.length === 0 && !valuesChip ? (
          <p className="rounded-md border border-dashed border-gray-200 px-2 py-1 text-[11px] text-gray-400">
            {emptyHint}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---- Properties / Format tabs ---- */}
      <div className="flex shrink-0 items-center gap-4 border-b border-gray-200 px-3">
        {(["properties", "format"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 py-2 text-xs font-medium capitalize transition-colors",
              tab === key
                ? "border-gray-800 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            {key}
          </button>
        ))}
      </div>

      {tab === "format" ? (
        <div className="flex flex-col">
          <Section label="Title">
            <Input
              value={element.title}
              onChange={(event) => onChange({ title: event.target.value })}
              className="h-8 text-sm"
              placeholder="Element title"
            />
          </Section>
          <Section label="Element type">
            <div className="grid grid-cols-6 gap-1">
              {(Object.keys(VIZ_LABELS) as AnalyticsVizType[]).map((viz) => {
                const Icon = VIZ_ICONS[viz];
                const active = element.viz === viz;
                return (
                  <button
                    key={viz}
                    type="button"
                    onClick={() => handleVizChange(viz)}
                    title={VIZ_LABELS[viz]}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-0.5 py-2 text-[9px] font-medium transition-colors",
                      active
                        ? "border-gray-400 bg-white text-gray-900 shadow-sm"
                        : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {VIZ_LABELS[viz].split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </Section>
          <DesignFormatControls element={element} onChange={onChange} />
          {!isPivot && !isText ? (
            <Section label="Sort">
              <Select
                value={query.sort ? `${query.sort.key}:${query.sort.dir}` : "auto"}
                onValueChange={(value) => {
                  if (value === "auto") {
                    updateQuery({ sort: null });
                    return;
                  }
                  const [key, dir] = value.split(":");
                  updateQuery({ sort: { key, dir: dir === "desc" ? "desc" : "asc" } });
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {sortOptions.flatMap((option) => [
                    <SelectItem key={`${option.key}:asc`} value={`${option.key}:asc`}>
                      {option.label} ↑
                    </SelectItem>,
                    <SelectItem key={`${option.key}:desc`} value={`${option.key}:desc`}>
                      {option.label} ↓
                    </SelectItem>,
                  ])}
                </SelectContent>
              </Select>
            </Section>
          ) : null}
          {isPivot ? (
            <Section
              label="Conditional formatting"
              hint="Colour values or rows — add a rule with +"
              action={
                formatTargets.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-gray-400 hover:text-gray-700"
                        aria-label="Add formatting rule"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {formatTargets.map((target) => (
                        <DropdownMenuItem
                          key={target.value}
                          onClick={() => {
                            const rule: AnalyticsConditionalFormat = target.isMeasure
                              ? {
                                  id: createFilterId(),
                                  target: target.value,
                                  kind: "scale",
                                  palette: "green",
                                }
                              : {
                                  id: createFilterId(),
                                  target: target.value,
                                  kind: "rule",
                                  palette: "amber",
                                  op: "contains",
                                  value: "",
                                };
                            onChange({
                              conditionalFormats: [...(element.conditionalFormats ?? []), rule],
                            });
                          }}
                          className="gap-2 text-xs"
                        >
                          <ColumnTypeIcon type={target.isMeasure ? "number" : "text"} />
                          {target.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            >
              {(element.conditionalFormats ?? []).length
                ? (element.conditionalFormats ?? []).map((rule, index) => (
                    <FormatRuleRow
                      key={rule.id}
                      rule={rule}
                      target={formatTargets.find((target) => target.value === rule.target)}
                      onChange={(next) => {
                        const rules = [...(element.conditionalFormats ?? [])];
                        rules[index] = next;
                        onChange({ conditionalFormats: rules });
                      }}
                      onRemove={() =>
                        onChange({
                          conditionalFormats: (element.conditionalFormats ?? []).filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    />
                  ))
                : null}
            </Section>
          ) : null}
          {!isText ? (
          <Section label="Row limit">
            <Input
              type="number"
              min={1}
              max={1000}
              value={query.limit}
              onChange={(event) => {
                const next = Math.min(Math.max(Number(event.target.value) || 1, 1), 1000);
                updateQuery({ limit: next });
              }}
              className="h-7 w-28 text-xs"
            />
          </Section>
          ) : null}
          {built && !isText ? (
            <div className="px-3 py-2.5">
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 hover:text-gray-700">
                  <ChevronDown className="h-3 w-3" />
                  View SQL
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-[10px] leading-relaxed text-gray-600">
                    {built.sql}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* ---- text content ---- */}
            {isText ? (
              <>
                <Section label="Text">
                  <Textarea
                    value={element.text?.content ?? ""}
                    onChange={(event) =>
                      onChange({
                        text: {
                          style: element.text?.style ?? "title",
                          content: event.target.value,
                        },
                      })
                    }
                    placeholder="Write a title or note…"
                    className="min-h-[72px] text-sm"
                  />
                </Section>
                <Section label="Style">
                  <div className="flex items-center rounded-md bg-gray-100 p-0.5">
                    {(["title", "heading", "body"] as AnalyticsTextConfig["style"][]).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() =>
                          onChange({
                            text: { content: element.text?.content ?? "", style },
                          })
                        }
                        className={cn(
                          "flex-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors",
                          (element.text?.style ?? "title") === style
                            ? "bg-white text-gray-800 shadow-sm"
                            : "text-gray-500 hover:text-gray-700",
                        )}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            ) : null}

            {/* ---- data source ---- */}
            {!isText ? (
            <Section label="Data source">
              {sourceOptions.length === 0 ? (
                <p className="rounded-md bg-white px-2.5 py-2 text-xs text-gray-600">
                  No synced tables yet. Create and sync a table in Build a Table first.
                </p>
              ) : (
              <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Table2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        BARE_TRIGGER,
                        "flex flex-1 items-center justify-between gap-1 rounded-md text-left",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {isCustomAnalyticsSource(query.source)
                          && sourceOptions.some((option) => option.key === query.source) ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/yjsmall.png"
                              alt=""
                              width={14}
                              height={14}
                              className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
                            />
                            <span className="truncate">{source.label}</span>
                          </>
                        ) : (
                          <span className="truncate text-gray-400">Select a table…</span>
                        )}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[min(18rem,var(--radix-dropdown-menu-trigger-width))] animate-in fade-in slide-in-from-top-2 zoom-in-95 duration-200"
                  >
                    {sourceOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.key}
                        className="gap-2"
                        onClick={() => {
                          const nextSource = option.key as AnalyticsSourceKey;
                          if (nextSource === query.source) return;
                          const nextMeta = option;
                          if (!isCustomAnalyticsSource(nextSource)) return;
                          const dateCol = nextMeta.defaultDateColumn;
                          const firstNumber = nextMeta.columns.find((c) => c.type === "number");
                          const firstText = nextMeta.columns.find(
                            (c) => c.type === "text" && !c.idLike,
                          );

                          let nextQuery = {
                            ...query,
                            source: nextSource,
                            dimensions: [] as typeof query.dimensions,
                            measures: [] as typeof query.measures,
                            columns: [] as string[],
                            filters: [] as typeof query.filters,
                            sort: null,
                          };

                          if (element.viz === "table") {
                            nextQuery = {
                              ...nextQuery,
                              mode: "raw",
                              columns: nextMeta.columns.slice(0, 8).map((c) => c.key),
                            };
                          } else if (element.viz === "metric") {
                            nextQuery = {
                              ...nextQuery,
                              measures: firstNumber
                                ? [{ agg: "sum", column: firstNumber.key }]
                                : [{ agg: "count", column: "*" }],
                              limit: 1,
                            };
                          } else {
                            nextQuery = {
                              ...nextQuery,
                              dimensions: dateCol
                                ? [{ column: dateCol, truncate: "month" }]
                                : firstText
                                  ? [{ column: firstText.key }]
                                  : [],
                              measures: firstNumber
                                ? [{ agg: "sum", column: firstNumber.key }]
                                : [{ agg: "count", column: "*" }],
                            };
                          }

                          onChange({
                            query: nextQuery,
                            ...(isPivot ? { pivot: { rows: [], columns: [] } } : {}),
                          });
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/yjsmall.png"
                          alt=""
                          width={14}
                          height={14}
                          className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs">{option.label}</p>
                          <p className="truncate text-[10px] text-gray-400">
                            {option.syncStatus === "syncing"
                              ? "Syncing…"
                              : formatSourceSyncedAt(option.lastSyncedAt)}
                          </p>
                        </div>
                        {option.key === query.source ? (
                          <span className="text-[10px] text-gray-400">Selected</span>
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                    {activeTableId ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2"
                          disabled={sourceSyncing}
                          onSelect={(event) => {
                            event.preventDefault();
                            void refreshSource();
                          }}
                        >
                          {sourceSyncing ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          )}
                          {sourceSyncing ? "Refreshing…" : "Refresh source"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() =>
                            router.push(
                              `/settings/store/build-table?table=${encodeURIComponent(activeTableId)}`,
                            )
                          }
                        >
                          <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          Edit source
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() =>
                            router.push(
                              `/settings/store/build-table?table=${encodeURIComponent(activeTableId)}`,
                            )
                          }
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          See source
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {isCustomAnalyticsSource(query.source)
              && sourceOptions.some((option) => option.key === query.source) ? (
                <p
                  className={cn(
                    "pl-5 text-[10px] leading-snug",
                    source.syncStatus === "error" || sourceSyncMessage?.includes("failed")
                      ? "text-red-600"
                      : "text-gray-400",
                  )}
                >
                  {sourceSyncing
                    ? sourceSyncMessage || "Syncing from Lightspeed…"
                    : source.syncError
                      ? source.syncError
                      : sourceSyncMessage
                        ? sourceSyncMessage
                        : source.lastSyncedAt
                          ? `Last synced ${formatSourceSyncedAt(source.lastSyncedAt)}${
                              source.syncRowCount != null
                                ? ` · ${source.syncRowCount.toLocaleString()} rows`
                                : ""
                            }`
                          : "Never synced"}
                </p>
              ) : null}
              </div>
              )}
            </Section>
            ) : null}

            {/* ---- table mode toggle ---- */}
            {element.viz === "table" ? (
              <Section label="Table mode">
                <div className="flex items-center rounded-md bg-gray-100 p-0.5">
                  {(["aggregate", "raw"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        if (mode !== query.mode) updateQuery({ mode, sort: null });
                      }}
                      className={cn(
                        "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                        query.mode === mode
                          ? "bg-white text-gray-800 shadow-sm"
                          : "text-gray-500 hover:text-gray-700",
                      )}
                    >
                      {mode === "aggregate" ? "Grouped" : "Raw rows"}
                    </button>
                  ))}
                </div>
              </Section>
            ) : null}

            {/* ---- pivot sections ---- */}
            {isPivot ? (
              <>
                <Section
                  label="Pivot rows"
                  action={
                    pivotRows.length < 3 ? (
                      <AddMenu
                        label="Add pivot row"
                        options={availableDimensionOptions}
                        onAdd={(key) => addPivotField("rows", key)}
                      />
                    ) : null
                  }
                >
                  {renderPivotDropZone(
                    "rows",
                    pivotRows,
                    "Drag a field here, or use +",
                    valuesIn === "rows" ? (
                      <ValuesChip
                        count={query.measures.length}
                        from="rows"
                        dragging={valuesDragFrom === "rows"}
                        onDragStart={() => {
                          setValuesDragFrom("rows");
                          setPivotDrag(null);
                          setPivotDropTarget(null);
                        }}
                        onDragEnd={() => {
                          setValuesDragFrom(null);
                          setPivotDropTarget(null);
                          setPivotDropIndex(null);
                        }}
                        onMove={() => moveValues("columns")}
                        moveLabel="Move to Pivot columns"
                        addOptions={measureAddOptions}
                        onAdd={addMeasure}
                        canAdd={query.measures.length < measureCap}
                      />
                    ) : null,
                  )}
                </Section>
                <Section
                  label="Pivot columns"
                  action={
                    pivotColumns.length < 2 ? (
                      <AddMenu
                        label="Add pivot column"
                        options={availableDimensionOptions}
                        onAdd={(key) => addPivotField("columns", key)}
                      />
                    ) : null
                  }
                >
                  {renderPivotDropZone(
                    "columns",
                    pivotColumns,
                    "Drag a field here, or use +",
                    valuesIn === "columns" ? (
                      <ValuesChip
                        count={query.measures.length}
                        from="columns"
                        dragging={valuesDragFrom === "columns"}
                        onDragStart={() => {
                          setValuesDragFrom("columns");
                          setPivotDrag(null);
                          setPivotDropTarget(null);
                        }}
                        onDragEnd={() => {
                          setValuesDragFrom(null);
                          setPivotDropTarget(null);
                          setPivotDropIndex(null);
                        }}
                        onMove={() => moveValues("rows")}
                        moveLabel="Move to Pivot rows"
                        addOptions={measureAddOptions}
                        onAdd={addMeasure}
                        canAdd={query.measures.length < measureCap}
                      />
                    ) : null,
                  )}
                </Section>
              </>
            ) : null}

            {/* ---- group by / x-axis ---- */}
            {!isPivot && !isMetric && !isRawTable ? (
              <Section
                label={element.viz === "table" ? "Group by" : "X-axis"}
                hint="Add a column to group by"
                action={
                  query.dimensions.length < 3 ? (
                    <AddMenu
                      label="Add grouping"
                      options={availableDimensionOptions}
                      onAdd={addDimension}
                    />
                  ) : null
                }
              >
                {query.dimensions.length
                  ? query.dimensions.map((dimension) =>
                      renderDimensionRow(dimension.column, () => removeDimension(dimension.column)),
                    )
                  : null}
              </Section>
            ) : null}

            {/* ---- raw table columns ---- */}
            {isRawTable ? (
              <Section
                label="Columns"
                hint="Add columns from the list below"
                action={
                  <AddMenu
                    label="Add column"
                    options={source.columns.filter((column) => !query.columns.includes(column.key))}
                    onAdd={(key) => updateQuery({ columns: [...query.columns, key] })}
                  />
                }
              >
                {query.columns.length
                  ? query.columns.map((key) => {
                      const column = getAnalyticsColumn(source, key);
                      if (!column) return null;
                      return (
                        <ItemRow
                          key={key}
                          icon={<ColumnTypeIcon type={column.type} />}
                          onRemove={() =>
                            updateQuery({ columns: query.columns.filter((k) => k !== key) })
                          }
                        >
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
                            {column.label}
                          </span>
                        </ItemRow>
                      );
                    })
                  : null}
              </Section>
            ) : null}

            {/* ---- values (measures) ---- */}
            {!isRawTable && !isText ? (
              <Section
                label={isMetric ? "Value" : "Values"}
                hint={
                  isMetric
                    ? "Add a value to aggregate"
                    : "Add one or more columns to aggregate"
                }
                action={
                  query.measures.length < measureCap ? (
                    <AddMenu
                      label="Add value"
                      options={measureAddOptions}
                      onAdd={addMeasure}
                    />
                  ) : null
                }
              >
                {query.measures.length
                  ? query.measures.map((measure, index) => {
                      const displayLabel = measureLabel(element, measure);
                      const updateMeasureAt = (
                        patch: Partial<typeof measure>,
                      ) => {
                        const next = [...query.measures];
                        next[index] = { ...measure, ...patch };
                        updateQuery({ measures: next, sort: null });
                        onSelectMeasure?.(index);
                      };
                      const removeMeasure = () => {
                        const next = query.measures.filter((_, i) => i !== index);
                        updateQuery({ measures: next, sort: null });
                        if (selectedMeasureIndex == null) return;
                        if (selectedMeasureIndex === index) {
                          onSelectMeasure?.(
                            next.length ? Math.min(index, next.length - 1) : null,
                          );
                        } else if (selectedMeasureIndex > index) {
                          onSelectMeasure?.(selectedMeasureIndex - 1);
                        }
                      };
                      return (
                        <ItemRow
                          key={`${measure.agg}-${measure.column}-${index}`}
                          icon={<ColumnTypeIcon type="number" />}
                          selected={selectedMeasureIndex === index}
                          onSelect={() => onSelectMeasure?.(index)}
                          showRemove={false}
                          onRemove={removeMeasure}
                          draggable={query.measures.length > 1}
                          dragging={measureDragIndex === index}
                          dropTarget={
                            measureDragIndex != null
                            && measureDropIndex === index
                            && measureDragIndex !== index
                          }
                          onDragStart={() => {
                            setMeasureDragIndex(index);
                            setMeasureDropIndex(index);
                          }}
                          onDragOver={() => {
                            if (measureDragIndex == null) return;
                            setMeasureDropIndex(index);
                          }}
                          onDrop={() => {
                            if (measureDragIndex == null) return;
                            reorderMeasures(measureDragIndex, index);
                            setMeasureDragIndex(null);
                            setMeasureDropIndex(null);
                          }}
                          onDragEnd={() => {
                            setMeasureDragIndex(null);
                            setMeasureDropIndex(null);
                          }}
                          actions={<FieldOptionsMenu onRemove={removeMeasure} />}
                        >
                          <MeasureLabelRow
                            label={displayLabel}
                            onRename={(nextLabel) => {
                              const trimmed = nextLabel.trim();
                              updateMeasureAt(
                                trimmed
                                  ? { label: trimmed }
                                  : {
                                      label: undefined,
                                      formula: measure.formula,
                                    },
                              );
                            }}
                          />
                        </ItemRow>
                      );
                    })
                  : null}
              </Section>
            ) : null}

            {/* ---- filters ---- */}
            {!isText ? (
            <Section
              label="Filters"
              hint="No filters applied"
              action={
                <AddMenu
                  label="Add filter"
                  options={source.columns.filter((column) => !column.idLike)}
                  onAdd={(key) => {
                    const column = getAnalyticsColumn(source, key);
                    const firstOp = FILTER_OPS_BY_TYPE[column?.type ?? "text"][0];
                    updateQuery({
                      filters: [
                        ...query.filters,
                        {
                          id: createFilterId(),
                          column: key,
                          op: firstOp.value,
                          value: firstOp.needsValue
                            ? column?.type === "date" && firstOp.valueKind === "number"
                              ? "30"
                              : ""
                            : undefined,
                        },
                      ],
                    });
                  }}
                />
              }
            >
              {query.filters.length
                ? query.filters.map((filter, index) => (
                    <FilterRow
                      key={filter.id}
                      source={source}
                      filter={filter}
                      onChange={(next) => {
                        const filters = [...query.filters];
                        filters[index] = next;
                        updateQuery({ filters });
                      }}
                      onRemove={() =>
                        updateQuery({ filters: query.filters.filter((_, i) => i !== index) })
                      }
                    />
                  ))
                : null}
            </Section>
            ) : null}
          </div>

          {/* ---- available columns (Sigma "Columns" tab) ---- */}
          {!isMetric && !isText ? (
            <div className="flex max-h-[40%] shrink-0 flex-col border-t border-gray-200 bg-gray-50/60">
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
                <p className="flex-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Add column
                </p>
                <Search className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <div className="px-3 pb-1.5">
                <Input
                  value={columnSearch}
                  onChange={(event) => setColumnSearch(event.target.value)}
                  placeholder="Search columns…"
                  className="h-7 bg-white text-xs"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
                {filteredColumns.map((column) => (
                  <div
                    key={column.key}
                    className="group flex h-7 items-center gap-1.5 rounded-md px-1.5 hover:bg-white"
                  >
                    <ColumnTypeIcon type={column.type} />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                      {column.label}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-gray-300 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100"
                      onClick={() => handleQuickAdd(column.key)}
                      aria-label={`Add ${column.label}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {filteredColumns.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-gray-400">No columns match.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MeasureLabelRow({
  label,
  onRename,
}: {
  label: string;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(label);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!editing) setValue(label);
  }, [label, editing]);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    onRename(value);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          // Stop bubbling so the parent row does not treat Space as "select".
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
            setValue(label);
          }
        }}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        className="h-6 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-1.5 text-xs font-medium text-gray-800 outline-none focus:border-gray-400"
      />
    );
  }

  return (
    <span
      title="Double-click to rename · drag to reorder"
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      className="min-w-0 flex-1 truncate text-left text-xs font-medium text-gray-700"
    >
      {label}
    </span>
  );
}

