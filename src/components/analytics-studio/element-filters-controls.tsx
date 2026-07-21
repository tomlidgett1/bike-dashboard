"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Filter,
  MoreHorizontal,
  Plus,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  analyticsSourceFromApiTable,
  getAnalyticsColumn,
  isCustomAnalyticsSource,
  parseCustomAnalyticsTableId,
  type AnalyticsColumn,
  type AnalyticsSource,
} from "@/lib/analytics-studio/catalog";
import type {
  AnalyticsDateTrunc,
  AnalyticsFilter,
  AnalyticsWorkbookElement,
} from "@/lib/analytics-studio/types";
import type { SavedApiTable } from "@/lib/table-builder/types";
import { DATE_TRUNC_OPTIONS, FILTER_OPS_BY_TYPE } from "./constants";
import { FilterRow } from "./filter-row";

const PANEL_WIDTH = 260;

function createFilterId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ColumnTypeIcon({ type }: { type: AnalyticsColumn["type"] }) {
  if (type === "date") {
    return <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />;
  }
  return (
    <span className="w-6 shrink-0 text-center font-mono text-[9px] font-medium leading-none text-gray-400">
      {type === "number" ? "123" : type === "boolean" ? "Y/N" : "ABC"}
    </span>
  );
}

const TRUNC_CONTROL_OPTIONS = DATE_TRUNC_OPTIONS.filter((option) =>
  ["week", "month", "quarter", "year"].includes(option.value),
);

function useElementSource(element: AnalyticsWorkbookElement, enabled: boolean) {
  const supabase = React.useMemo(() => createClient(), []);
  const [source, setSource] = React.useState<AnalyticsSource | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      if (!isCustomAnalyticsSource(element.query.source)) {
        setSource(null);
        return;
      }
      const tableId = parseCustomAnalyticsTableId(element.query.source);
      if (!tableId) {
        setSource(null);
        return;
      }
      const { data } = await supabase
        .from("api_builder_tables")
        .select(
          "id, user_id, name, source, grain, columns, column_labels, calculated_columns, created_at, updated_at, last_synced_at, sync_row_count, sync_status, sync_error",
        )
        .eq("id", tableId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setSource(null);
        return;
      }
      setSource(analyticsSourceFromApiTable(data as SavedApiTable));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, element.query.source, supabase]);

  return source;
}

/** Card header filter icon → Filters & controls dropdown. */
export function ElementFiltersControlsMenu({
  element,
  onUpdate,
  open,
  onOpenChange,
}: {
  element: AnalyticsWorkbookElement;
  onUpdate: (patch: Partial<AnalyticsWorkbookElement>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  const [mounted, setMounted] = React.useState(false);
  const source = useElementSource(element, open);
  const filters = element.query.filters ?? [];
  const filterCount = filters.length;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = React.useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.right - PANEL_WIDTH),
      window.innerWidth - PANEL_WIDTH - 8,
    );
    const estimatedHeight = panelRef.current?.offsetHeight ?? 220;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top =
      spaceBelow >= Math.min(estimatedHeight, 180)
        ? rect.bottom + 6
        : Math.max(8, rect.top - estimatedHeight - 6);
    setCoords({ top, left });
  }, []);

  React.useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
    const raf = requestAnimationFrame(() => updatePosition());
    const onReposition = () => updatePosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // Nested menus (add filter / FilterRow) portal outside the panel.
      if (
        target.closest(
          '[data-radix-popper-content-wrapper], [data-slot="dropdown-menu-content"], [role="menu"]',
        )
      ) {
        return;
      }
      onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onOpenChange]);

  const filterColumns = React.useMemo(() => {
    if (!source) return [] as AnalyticsColumn[];
    const preferred = new Set<string>();
    for (const measure of element.query.measures) {
      if (measure.column !== "*") preferred.add(measure.column);
    }
    for (const dimension of element.query.dimensions) {
      preferred.add(dimension.column);
    }
    for (const key of element.query.columns ?? []) {
      preferred.add(key);
    }
    const preferredCols = source.columns.filter(
      (column) => preferred.has(column.key) && !column.idLike,
    );
    const rest = source.columns.filter(
      (column) => !preferred.has(column.key) && !column.idLike,
    );
    return [...preferredCols, ...rest];
  }, [source, element.query.measures, element.query.dimensions, element.query.columns]);

  const dateDimension = element.query.dimensions.find((dimension) => {
    if (!source) return Boolean(dimension.truncate);
    return getAnalyticsColumn(source, dimension.column)?.type === "date";
  });

  const updateFilters = (next: AnalyticsFilter[]) => {
    onUpdate({ query: { ...element.query, filters: next } });
  };

  const addFilter = (columnKey: string) => {
    const column = source ? getAnalyticsColumn(source, columnKey) : undefined;
    const firstOp = FILTER_OPS_BY_TYPE[column?.type ?? "text"][0];
    updateFilters([
      ...filters,
      {
        id: createFilterId(),
        column: columnKey,
        op: firstOp.value,
        value: firstOp.needsValue
          ? column?.type === "date" && firstOp.valueKind === "number"
            ? "30"
            : ""
          : undefined,
      },
    ]);
  };

  const setDateTrunc = (truncate: AnalyticsDateTrunc) => {
    if (!dateDimension) return;
    onUpdate({
      query: {
        ...element.query,
        dimensions: element.query.dimensions.map((dimension) =>
          dimension.column === dateDimension.column
            ? { ...dimension, truncate }
            : dimension,
        ),
      },
    });
  };

  const activeTrunc = dateDimension?.truncate ?? "month";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={
          filterCount === 0
            ? "Filters & controls"
            : filterCount === 1
              ? "1 filter"
              : `${filterCount} filters`
        }
        aria-label={
          filterCount === 0
            ? "Filters & controls"
            : filterCount === 1
              ? "1 filter"
              : `${filterCount} filters`
        }
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
        className={cn(
          "inline-flex h-5 items-center gap-0.5 rounded-md px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700",
          filterCount > 0 || open
            ? "bg-gray-100 opacity-100"
            : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Filter className="h-3 w-3" />
        {filterCount > 1 ? (
          <span className="min-w-[0.75rem] text-center text-[10px] font-medium tabular-nums leading-none">
            {filterCount}
          </span>
        ) : null}
      </button>

      {mounted && open && coords
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Filters & controls"
              style={{
                top: coords.top,
                left: coords.left,
                width: PANEL_WIDTH,
              }}
              className="fixed z-[200] max-h-[min(360px,calc(100vh-16px))] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-md animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200 ease-out"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-2.5 py-1.5">
                <p className="text-xs font-semibold text-gray-900">Filters & controls</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="h-5 w-5 text-gray-400 hover:text-gray-700"
                  aria-label="Close"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <div className="border-b border-gray-100 px-2.5 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    Filters
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="h-5 w-5 text-gray-400 hover:text-gray-700"
                        disabled={!source || filterColumns.length === 0}
                        aria-label="Add filter"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="z-[210] max-h-56 w-52 overflow-y-auto rounded-md"
                    >
                      {filterColumns.map((column) => (
                        <DropdownMenuItem
                          key={column.key}
                          className="gap-2 text-xs"
                          onSelect={() => addFilter(column.key)}
                        >
                          <ColumnTypeIcon type={column.type} />
                          <span className="min-w-0 flex-1 truncate">{column.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {filters.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-gray-400">
                    No existing filters
                  </p>
                ) : source ? (
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {filters.map((filter, index) => (
                      <FilterRow
                        key={filter.id}
                        source={source}
                        filter={filter}
                        onChange={(nextFilter) => {
                          const next = [...filters];
                          next[index] = nextFilter;
                          updateFilters(next);
                        }}
                        onRemove={() =>
                          updateFilters(filters.filter((_, i) => i !== index))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="py-1.5 text-center text-[11px] text-gray-400">
                    Loading fields…
                  </p>
                )}
              </div>

              <div className="px-2.5 py-2">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  Controls
                </p>
                {dateDimension ? (
                  <div className="rounded-md">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-gray-900">
                        Date truncation
                      </p>
                      <MoreHorizontal className="h-3 w-3 text-gray-300" aria-hidden />
                    </div>
                    <div className="flex items-center rounded-md bg-gray-100 p-0.5">
                      {TRUNC_CONTROL_OPTIONS.map((option) => {
                        const active = activeTrunc === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDateTrunc(option.value)}
                            className={cn(
                              "flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                              active
                                ? "bg-white text-gray-800 shadow-sm"
                                : "text-gray-600 hover:bg-gray-200/70",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="py-1.5 text-center text-[11px] text-gray-400">
                    No date grouping on this element
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
