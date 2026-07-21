"use client";

import * as React from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Trash2,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  getAnalyticsColumn,
  type AnalyticsColumnType,
  type AnalyticsSource,
} from "@/lib/analytics-studio/catalog";
import type { AnalyticsFilter } from "@/lib/analytics-studio/types";
import { FILTER_OPS_BY_TYPE } from "./constants";

function ColumnTypeIcon({ type }: { type: AnalyticsColumnType }) {
  if (type === "date") return <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />;
  return (
    <span className="w-6 shrink-0 text-center font-mono text-[9px] font-medium leading-none text-gray-400">
      {type === "number" ? "123" : type === "boolean" ? "Y/N" : "ABC"}
    </span>
  );
}

function formatFilterSummary(
  opLabel: string,
  valueKind: string,
  value?: string,
  valueTo?: string,
): string {
  const trimmed = (value ?? "").trim();
  const trimmedTo = (valueTo ?? "").trim();
  if (valueKind === "date_range") {
    if (trimmed && trimmedTo) return `${trimmed} – ${trimmedTo}`;
    if (trimmed || trimmedTo) return trimmed || trimmedTo;
    return opLabel;
  }
  if (!trimmed) return opLabel;
  if (valueKind === "number") return opLabel.replace(/\bN\b/, trimmed);
  return `${opLabel} ${trimmed}`;
}

/** Standard field row with filter condition/value in a chevron menu. */
export function FilterRow({
  source,
  filter,
  onChange,
  onRemove,
}: {
  source: AnalyticsSource;
  filter: AnalyticsFilter;
  onChange: (filter: AnalyticsFilter) => void;
  onRemove: () => void;
}) {
  const column = getAnalyticsColumn(source, filter.column);
  const ops = FILTER_OPS_BY_TYPE[column?.type ?? "text"];
  const currentOp = ops.find((op) => op.value === filter.op) ?? ops[0];
  const valueKind =
    currentOp.valueKind
    ?? (column?.type === "number"
      ? "number"
      : column?.type === "date"
        ? "date"
        : currentOp.needsValue
          ? "text"
          : "none");
  const summary = formatFilterSummary(
    currentOp.label,
    valueKind,
    filter.value,
    filter.valueTo,
  );

  const setOp = (value: string) => {
    const nextOp = ops.find((op) => op.value === value) ?? currentOp;
    const keepValue = filter.op === nextOp.value;
    onChange({
      ...filter,
      op: nextOp.value,
      value: nextOp.needsValue ? (keepValue ? filter.value : "") : undefined,
      valueTo:
        nextOp.valueKind === "date_range"
          ? keepValue
            ? filter.valueTo
            : ""
          : undefined,
    });
  };

  return (
    <div className="group flex h-6 items-center gap-1 rounded-md px-1 hover:bg-gray-50">
      <ColumnTypeIcon type={column?.type ?? "text"} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
        {column?.label ?? filter.column}
      </span>
      <span className="max-w-[7rem] shrink-0 truncate text-[10px] text-gray-400">
        {summary}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-5 w-auto shrink-0 gap-0.5 px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="Filter options"
            aria-label="Filter options"
          >
            <ChevronDown className="h-2.5 w-2.5 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-56 rounded-md"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="whitespace-nowrap text-xs">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0">Condition</span>
                <span className="ml-auto truncate text-[10px] text-gray-400">
                  {currentOp.label}
                </span>
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto rounded-md">
              {ops.map((op) => {
                const active = currentOp.value === op.value;
                return (
                  <DropdownMenuItem
                    key={op.value}
                    className="text-xs"
                    onSelect={() => setOp(op.value)}
                  >
                    <span className="min-w-0 flex-1">{op.label}</span>
                    {active ? <Check className="h-3.5 w-3.5 text-gray-700" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {currentOp.needsValue ? (
            <div
              className="space-y-1.5 border-t border-gray-100 px-2 py-2"
              onPointerDown={(event) => event.preventDefault()}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {valueKind === "date_range" ? "Date range" : "Value"}
              </p>
              {valueKind === "date_range" ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={filter.value ?? ""}
                    onChange={(event) =>
                      onChange({ ...filter, value: event.target.value })
                    }
                    className="h-7 flex-1 text-xs"
                  />
                  <span className="shrink-0 text-[10px] text-gray-400">–</span>
                  <Input
                    type="date"
                    value={filter.valueTo ?? ""}
                    onChange={(event) =>
                      onChange({ ...filter, valueTo: event.target.value })
                    }
                    className="h-7 flex-1 text-xs"
                  />
                </div>
              ) : (
                <Input
                  type={
                    valueKind === "number"
                      ? "number"
                      : valueKind === "date"
                        ? "date"
                        : "text"
                  }
                  value={filter.value ?? ""}
                  onChange={(event) =>
                    onChange({ ...filter, value: event.target.value })
                  }
                  placeholder={
                    valueKind === "number"
                      ? "e.g. 30"
                      : valueKind === "date"
                        ? "YYYY-MM-DD"
                        : "Value"
                  }
                  min={valueKind === "number" ? 1 : undefined}
                  className="h-7 text-xs"
                />
              )}
            </div>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs" onSelect={() => onRemove()}>
            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
