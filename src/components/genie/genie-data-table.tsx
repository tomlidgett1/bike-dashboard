"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadTableCsv } from "@/lib/utils/genie-visual-export";
import {
  formatTableCellValue,
  type VisualDateFormat,
  type VisualValueFormat,
} from "@/lib/genie/visual-format";
import type {
  GenieTableColumn,
  GenieTablePayload,
} from "@/lib/genie/visual-payloads";

export type { VisualValueFormat };
export type { GenieTableColumn, GenieTablePayload };

type GenieTableRow = Record<string, string | number | null>;

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
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const isPanel = variant === "panel";
  const isDashboard = variant === "dashboard";
  const cellTextClass = isPanel || isDashboard ? "text-xs" : "text-sm";
  const headerPad = isPanel || isDashboard ? "px-3 py-2" : "px-4 py-2";
  const cellPad = isPanel || isDashboard ? "px-3 py-2" : "px-4 py-2";

  const columns = React.useMemo<ColumnDef<GenieTableRow>[]>(
    () =>
      table.columns.map((column) => ({
        id: column.key,
        accessorKey: column.key,
        header: column.label,
        meta: column,
        sortingFn: (rowA, rowB, columnId) =>
          compareTableValues(rowA.getValue(columnId), rowB.getValue(columnId), column.format),
        cell: ({ getValue }) => {
          const columnFormat = columnFormats?.[column.key];
          return formatTableCellValue(getValue() as string | number | null | undefined, {
            format: columnFormat?.valueFormat || column.format,
            dateFormat: columnFormat?.dateFormat ?? dateFormat,
          });
        },
      })),
    [columnFormats, dateFormat, table.columns],
  );

  const tableModel = useReactTable({
    data: table.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (_row, index) => String(index),
  });

  const rows = tableModel.getRowModel().rows;

  const handleDownloadCsv = () => {
    downloadTableCsv({
      title: table.title,
      columns: table.columns,
      rows: rows.map((row) => row.original),
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
            {tableModel.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={isPanel ? "bg-muted/45" : "bg-muted/50"}>
                {headerGroup.headers.map((header) => {
                  const column = header.column.columnDef.meta as GenieTableColumn;
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      title={column.label}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
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
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30",
                          column.align === "right" ? "justify-end" : "justify-start",
                        )}
                      >
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        {sorted === "asc" ? (
                          <ArrowUp className={cn("shrink-0", isPanel ? "h-3 w-3" : "h-3.5 w-3.5")} />
                        ) : sorted === "desc" ? (
                          <ArrowDown className={cn("shrink-0", isPanel ? "h-3 w-3" : "h-3.5 w-3.5")} />
                        ) : (
                          <ArrowUpDown className={cn("shrink-0 opacity-45", isPanel ? "h-3 w-3" : "h-3.5 w-3.5")} />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/50">
                {row.getVisibleCells().map((cell) => {
                  const column = cell.column.columnDef.meta as GenieTableColumn;
                  const display = String(cell.getValue() ?? "—");
                  const numeric = isNumericColumn(column);

                  return (
                    <td
                      key={cell.id}
                      title={!numeric && display !== "—" ? display : undefined}
                      className={cn(
                        columnMinWidth(column.format, column.align),
                        cellPad,
                        "align-top text-muted-foreground whitespace-nowrap",
                        column.align === "right" && "text-right font-mono tabular-nums",
                        !numeric && "max-w-[18rem] truncate",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr className="border-t border-border/50">
                <td
                  colSpan={table.columns.length}
                  className={cn(
                    cellPad,
                    "h-20 text-center text-xs font-medium text-muted-foreground",
                  )}
                >
                  No table data
                </td>
              </tr>
            ) : null}
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
