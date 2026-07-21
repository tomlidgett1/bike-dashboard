"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Trash2 } from "@/components/layout/app-sidebar/dashboard-icons";
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
import type { VisualDateFormat } from "@/lib/genie/visual-format";
import type { AnalyticsDateTrunc } from "@/lib/analytics-studio/types";
import { DATE_TRUNC_OPTIONS } from "./constants";

const DATE_FORMAT_OPTIONS: Array<{
  value: VisualDateFormat;
  label: string;
  short: string;
}> = [
  { value: "default", label: "Default", short: "Default" },
  { value: "short", label: "Short date", short: "Short" },
  { value: "long", label: "Long date", short: "Long" },
  { value: "ordinal", label: "Ordinal date", short: "Ordinal" },
];

const SORT_OPTIONS: Array<{
  value: "asc" | "desc";
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "asc", label: "Ascending", short: "Asc", icon: ArrowUp },
  { value: "desc", label: "Descending", short: "Desc", icon: ArrowDown },
];

function truncShortLabel(truncate: AnalyticsDateTrunc | undefined): string {
  return DATE_TRUNC_OPTIONS.find((option) => option.value === (truncate ?? "month"))?.label
    ?? "Month";
}

function formatShortLabel(format: VisualDateFormat | undefined): string {
  return DATE_FORMAT_OPTIONS.find((option) => option.value === (format ?? "default"))?.short
    ?? "Default";
}

function sortShortLabel(sortDir: "asc" | "desc" | undefined): string {
  return sortDir === "desc" ? "Desc" : "Asc";
}

/** Chevron-only field menu (non-date rows): remove lives here, not as a row X. */
export function FieldOptionsMenu({
  onRemove,
  align = "end",
}: {
  onRemove: () => void;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-auto shrink-0 gap-0.5 px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          title="Field options"
          aria-label="Field options"
          onClick={(event) => event.stopPropagation()}
        >
          <ChevronDown className="h-2.5 w-2.5 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="min-w-40 rounded-md"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem className="text-xs" onSelect={() => onRemove()}>
          <Trash2 className="h-3.5 w-3.5 text-gray-400" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DateOptionsMenu({
  truncate,
  dateFormat,
  sortDir,
  onTruncateChange,
  onDateFormatChange,
  onSortDirChange,
  onRemove,
  showSummary = false,
  align = "end",
}: {
  truncate?: AnalyticsDateTrunc;
  dateFormat?: VisualDateFormat;
  sortDir?: "asc" | "desc";
  onTruncateChange: (truncate: AnalyticsDateTrunc) => void;
  onDateFormatChange: (format: VisualDateFormat) => void;
  onSortDirChange: (dir: "asc" | "desc") => void;
  onRemove?: () => void;
  showSummary?: boolean;
  align?: "start" | "center" | "end";
}) {
  const activeTrunc = truncate ?? "month";
  const activeFormat = dateFormat ?? "default";
  const activeSort = sortDir ?? "asc";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-auto shrink-0 gap-0.5 px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          title="Date options"
          aria-label="Date options"
          onClick={(event) => event.stopPropagation()}
        >
          {showSummary ? (
            <span className="max-w-[7rem] truncate text-[10px] font-medium text-gray-600">
              {truncShortLabel(activeTrunc)} · {formatShortLabel(activeFormat)} ·{" "}
              {sortShortLabel(activeSort)}
            </span>
          ) : null}
          <ChevronDown className="h-2.5 w-2.5 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="min-w-56 rounded-md"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="whitespace-nowrap text-xs">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0">Group by</span>
              <span className="ml-auto truncate text-[10px] text-gray-400">
                {truncShortLabel(activeTrunc)}
              </span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="rounded-md">
            {DATE_TRUNC_OPTIONS.map((option) => {
              const active = activeTrunc === option.value;
              return (
                <DropdownMenuItem
                  key={option.value}
                  className="text-xs"
                  onSelect={() => onTruncateChange(option.value)}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 text-gray-700" /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="whitespace-nowrap text-xs">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0">Format</span>
              <span className="ml-auto truncate text-[10px] text-gray-400">
                {formatShortLabel(activeFormat)}
              </span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="rounded-md">
            {DATE_FORMAT_OPTIONS.map((option) => {
              const active = activeFormat === option.value;
              return (
                <DropdownMenuItem
                  key={option.value}
                  className="text-xs"
                  onSelect={() => onDateFormatChange(option.value)}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 text-gray-700" /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="whitespace-nowrap text-xs">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0">Sort</span>
              <span className="ml-auto truncate text-[10px] text-gray-400">
                {sortShortLabel(activeSort)}
              </span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="rounded-md">
            {SORT_OPTIONS.map((option) => {
              const active = activeSort === option.value;
              const Icon = option.icon;
              return (
                <DropdownMenuItem
                  key={option.value}
                  className="gap-2 text-xs"
                  onSelect={() => onSortDirChange(option.value)}
                >
                  <Icon className="h-3.5 w-3.5 text-gray-500" />
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 text-gray-700" /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {onRemove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onSelect={() => onRemove()}>
              <Trash2 className="h-3.5 w-3.5 text-gray-400" />
              Remove
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
