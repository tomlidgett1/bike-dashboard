"use client";

import * as React from "react";
import { CalendarDays, Plus, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  AnalyticsFilter,
  AnalyticsWorkbookElement,
} from "@/lib/analytics-studio/types";
import type { SavedApiTable } from "@/lib/table-builder/types";
import { FILTER_OPS_BY_TYPE } from "./constants";
import { FilterRow } from "./filter-row";

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

export function ElementFilterDialog({
  open,
  onOpenChange,
  element,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  element: AnalyticsWorkbookElement;
  onUpdate: (patch: Partial<AnalyticsWorkbookElement>) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [source, setSource] = React.useState<AnalyticsSource | null>(null);

  React.useEffect(() => {
    if (!open) return;
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
  }, [open, element.query.source, supabase]);

  const filters = element.query.filters ?? [];

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="animate-in fade-in duration-200"
        className="max-w-md gap-0 rounded-md border border-gray-200 bg-white p-0 shadow-lg animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="border-b border-gray-100 px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-gray-900">
            Filter · {element.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 px-4 py-3">
          {filters.length === 0 ? (
            <div className="rounded-xl bg-white px-3 py-4 text-center text-xs text-gray-500 ring-1 ring-gray-100">
              No filters yet. Add one to narrow the metrics in this element.
            </div>
          ) : (
            source
              ? filters.map((filter, index) => (
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
                ))
              : null
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={!source || filterColumns.length === 0}
              >
                <Plus className="h-3.5 w-3.5" />
                Add filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto rounded-md">
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
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-gray-600"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Done
          </Button>
        </div>
        {!source && isCustomAnalyticsSource(element.query.source) ? (
          <p className={cn("px-4 pb-3 text-[11px] text-gray-500")}>
            Loading fields…
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
