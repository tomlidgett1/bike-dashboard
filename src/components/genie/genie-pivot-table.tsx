"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import { downloadPivotTableCsv } from "@/lib/utils/genie-visual-export";
import type { DashboardWidgetFieldFormats } from "@/lib/dashboard/store-dashboard";
import {
  formatAxisPartsWithFormats,
  formatPivotNumericValue,
  hasCustomAxisFormats,
  type VisualDateFormat,
  type VisualValueFormat,
} from "@/lib/genie/visual-format";

function PivotHeaderCell({
  label,
  align = "right",
  className,
  truncate = false,
}: {
  label: string;
  align?: "left" | "right";
  className?: string;
  truncate?: boolean;
}) {
  const cell = (
    <th
      title={label}
      className={cn(
        "border-b border-border/70 px-3 py-2.5 text-xs font-semibold leading-none text-foreground whitespace-nowrap",
        truncate && "max-w-[14rem] truncate",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {label}
    </th>
  );

  if (!truncate) return cell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-center text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function pivotRowLabel(
  table: GeniePivotTablePayload,
  row: GeniePivotTablePayload["rows"][number],
  fallbackDateFormat: VisualDateFormat,
  rowFieldFormats?: Record<string, VisualDateFormat>,
) {
  if (!hasCustomAxisFormats(fallbackDateFormat, rowFieldFormats)) return row.row_label;
  const parts = table.row_fields.map((field) => row.row_values[field.key] ?? "—");
  const keys = table.row_fields.map((field) => field.key);
  return formatAxisPartsWithFormats(parts, keys, rowFieldFormats ?? {}, fallbackDateFormat);
}

function pivotColumnLabel(
  table: GeniePivotTablePayload,
  column: GeniePivotTablePayload["columns"][number],
  fallbackDateFormat: VisualDateFormat,
  columnFieldFormats?: Record<string, VisualDateFormat>,
) {
  if (!hasCustomAxisFormats(fallbackDateFormat, columnFieldFormats)) return column.label;
  const parts = column.key.split("||");
  const keys = table.column_fields.map((field) => field.key);
  return formatAxisPartsWithFormats(parts, keys, columnFieldFormats ?? {}, fallbackDateFormat);
}

export function GeniePivotTable({
  table,
  embedded = false,
  showCsvDownload = !embedded,
  dateFormat = "default",
  fieldFormats,
}: {
  table: GeniePivotTablePayload;
  embedded?: boolean;
  showCsvDownload?: boolean;
  dateFormat?: VisualDateFormat;
  fieldFormats?: DashboardWidgetFieldFormats;
}) {
  const hasTotals = Boolean(table.column_totals || table.rows.some((row) => row.total != null));
  const rowHeaderLabel = table.row_fields.map((field) => field.label).join(" / ");
  const valueFormat: VisualValueFormat =
    fieldFormats?.pivotValueFormat ?? table.value.format ?? "number";
  const valueColMin = valueFormat === "currency" ? "min-w-[7rem]" : "min-w-[5.5rem]";
  const rowFieldFormats = fieldFormats?.pivotRowFields;
  const columnFieldFormats = fieldFormats?.pivotColumnFields;

  const tableContent = (
      <div className={cn("overflow-x-auto", !embedded && "border-t border-border/70")}>
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <PivotHeaderCell
                label={rowHeaderLabel}
                align="left"
                truncate
                className="sticky left-0 z-10 min-w-[10rem] border-r border-border/70 bg-muted/50"
              />
              {table.columns.map((column) => (
                <PivotHeaderCell
                  key={column.key}
                  label={pivotColumnLabel(table, column, dateFormat, columnFieldFormats)}
                  className={valueColMin}
                />
              ))}
              {hasTotals ? (
                <th className={cn(valueColMin, "border-b border-border/70 bg-muted/30 px-3 py-2.5 text-right text-xs font-semibold leading-none text-foreground whitespace-nowrap")}>
                  Total
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.row_key} className="border-t border-border/50">
                <td
                  title={pivotRowLabel(table, row, dateFormat, rowFieldFormats)}
                  className="sticky left-0 z-10 max-w-[14rem] truncate border-r border-border/50 bg-background px-3 py-2 font-medium text-foreground whitespace-nowrap"
                >
                  {pivotRowLabel(table, row, dateFormat, rowFieldFormats)}
                </td>
                {table.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(valueColMin, "px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap")}
                  >
                    {formatPivotNumericValue(row.cells[column.key], valueFormat)}
                  </td>
                ))}
                {hasTotals ? (
                  <td className={cn(valueColMin, "bg-muted/20 px-3 py-2 text-right font-mono text-xs font-medium tabular-nums text-foreground whitespace-nowrap")}>
                    {formatPivotNumericValue(row.total, valueFormat)}
                  </td>
                ) : null}
              </tr>
            ))}
            {table.column_totals ? (
              <tr className="border-t border-border/70 bg-muted/30 font-medium">
                <td className="sticky left-0 z-10 border-r border-border/70 bg-muted/30 px-3 py-2 text-foreground whitespace-nowrap">
                  Total
                </td>
                {table.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(valueColMin, "px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground whitespace-nowrap")}
                  >
                    {formatPivotNumericValue(table.column_totals?.[column.key], valueFormat)}
                  </td>
                ))}
                {hasTotals ? (
                  <td className={cn(valueColMin, "px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground whitespace-nowrap")}>
                    {formatPivotNumericValue(table.grand_total, valueFormat)}
                  </td>
                ) : null}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
  );

  if (embedded) {
    return <div className="h-full min-h-0">{tableContent}</div>;
  }

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate font-semibold leading-tight text-foreground">{table.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          {showCsvDownload ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => downloadPivotTableCsv(table)}
              className="h-8 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label={`Download ${table.title} as CSV`}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          ) : null}
        </div>
      </div>
      {tableContent}
    </div>
  );
}
