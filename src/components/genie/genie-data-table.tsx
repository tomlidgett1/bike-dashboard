"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadTableCsv } from "@/lib/utils/genie-visual-export";
import {
  formatTableCellValue,
  formatVisualValue,
  type VisualDateFormat,
  type VisualValueFormat,
} from "@/lib/genie/visual-format";

export type { VisualValueFormat };

export interface GenieTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: VisualValueFormat;
}

export interface GenieTablePayload {
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

function compareTableValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  format?: VisualValueFormat,
): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNumber = typeof a === "number" ? a : Number(String(a).replace(/[$,%]/g, ""));
  const bNumber = typeof b === "number" ? b : Number(String(b).replace(/[$,%]/g, ""));
  if (
    (format === "currency" || format === "number" || format === "percent"
      || (Number.isFinite(aNumber) && Number.isFinite(bNumber)))
    && Number.isFinite(aNumber)
    && Number.isFinite(bNumber)
  ) {
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

function columnMinWidth(format?: VisualValueFormat, align?: "left" | "right") {
  if (format === "currency") return "min-w-[7rem]";
  if (format === "number" || format === "percent") return "min-w-[5.5rem]";
  if (align === "right") return "min-w-[5.5rem]";
  return "min-w-[9rem]";
}

function isNumericColumn(column: GenieTableColumn) {
  return (
    column.format === "currency"
    || column.format === "number"
    || column.format === "percent"
    || column.align === "right"
  );
}

export function GenieDataTable({
  table,
  variant = "chat",
  embedded = false,
  showCsvDownload = variant === "chat" || variant === "dashboard",
  animated = variant === "panel",
  dateFormat = "default",
  columnFormats,
}: {
  table: GenieTablePayload;
  variant?: "panel" | "chat" | "dashboard";
  embedded?: boolean;
  showCsvDownload?: boolean;
  animated?: boolean;
  dateFormat?: VisualDateFormat;
  columnFormats?: Record<string, { valueFormat?: VisualValueFormat | ""; dateFormat?: VisualDateFormat }>;
}) {
  const [sort, setSort] = React.useState<TableSortState | null>(null);
  const rows = sortedTableRows(table, sort);
  const isPanel = variant === "panel";
  const isDashboard = variant === "dashboard";
  const cellTextClass = isPanel || isDashboard ? "text-xs" : "text-sm";
  const headerPad = isPanel || isDashboard ? "px-3 py-2" : "px-4 py-2";
  const cellPad = isPanel || isDashboard ? "px-3 py-2" : "px-4 py-2";

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

  const shellClassName = cn(
    "w-full overflow-hidden border border-border/70 bg-background",
    isPanel ? "max-w-full rounded-md shadow-xs" : isDashboard ? "rounded-md shadow-sm" : "rounded-3xl shadow-sm",
  );

  const tableSection = (
      <div className={cn("overflow-x-auto", !embedded && "border-t border-border/70")}>
        <table className={cn("w-max min-w-full border-collapse", cellTextClass)}>
          <thead>
            <tr className={isPanel ? "bg-muted/45" : "bg-muted/50"}>
              {table.columns.map((column) => (
                <th
                  key={column.key}
                  title={column.label}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === "asc" ? "ascending" : "descending"
                      : "none"
                  }
                  className={cn(
                    columnMinWidth(column.format, column.align),
                    headerPad,
                    "border-b border-border/70 font-semibold leading-none text-foreground whitespace-nowrap",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30",
                      column.align === "right" ? "justify-end" : "justify-start",
                    )}
                  >
                    <span>{column.label}</span>
                    {sort?.key === column.key ? (
                      sort.direction === "asc"
                        ? <ArrowUp className={cn("shrink-0", isPanel ? "h-3 w-3" : "h-3.5 w-3.5")} />
                        : <ArrowDown className={cn("shrink-0", isPanel ? "h-3 w-3" : "h-3.5 w-3.5")} />
                    ) : (
                      <ArrowUpDown className={cn("shrink-0 opacity-45", isPanel ? "h-3 w-3" : "h-3.5 w-3.5")} />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border/50">
                {table.columns.map((column) => {
                  const columnFormat = columnFormats?.[column.key];
                  const display = formatTableCellValue(row[column.key], {
                    format: columnFormat?.valueFormat || column.format,
                    dateFormat: columnFormat?.dateFormat ?? dateFormat,
                  });
                  const numeric = isNumericColumn(column);

                  return (
                    <td
                      key={column.key}
                      title={!numeric && display !== "—" ? display : undefined}
                      className={cn(
                        columnMinWidth(column.format, column.align),
                        cellPad,
                        "align-top text-muted-foreground whitespace-nowrap",
                        column.align === "right" && "text-right font-mono tabular-nums",
                        !numeric && "max-w-[18rem] truncate",
                      )}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  if (embedded) {
    return <div className="h-full min-h-0">{tableSection}</div>;
  }

  const shellContent = (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          isPanel || isDashboard ? "px-3 py-2.5" : "px-4 py-3",
        )}
      >
        <p
          className={cn(
            "min-w-0 truncate font-semibold leading-tight text-foreground",
            (isPanel || isDashboard) && "text-sm",
          )}
        >
          {table.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {showCsvDownload ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDownloadCsv}
              className="h-8 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label={`Download ${table.title} as CSV`}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          ) : null}
        </div>
      </div>
      {tableSection}
    </>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={shellClassName}
      >
        {shellContent}
      </motion.div>
    );
  }

  return <div className={shellClassName}>{shellContent}</div>;
}
