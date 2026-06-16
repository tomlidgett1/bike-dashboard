"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "@/components/layout/app-sidebar/dashboard-icons";
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

type PivotRow = GeniePivotTablePayload["rows"][number];

interface PivotColumnMeta {
  align: "left" | "right";
  label: string;
  minWidth: string;
  sticky?: boolean;
  total?: boolean;
  truncate?: boolean;
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

function comparePivotValues(a: unknown, b: unknown) {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNumber = typeof a === "number" ? a : Number(a);
  const bNumber = typeof b === "number" ? b : Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
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
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const hasTotals = Boolean(table.column_totals || table.rows.some((row) => row.total != null));
  const rowHeaderLabel = table.row_fields.map((field) => field.label).join(" / ");
  const valueFormat: VisualValueFormat =
    fieldFormats?.pivotValueFormat ?? table.value.format ?? "number";
  const valueColMin = valueFormat === "currency" ? "min-w-[7rem]" : "min-w-[5.5rem]";
  const rowFieldFormats = fieldFormats?.pivotRowFields;
  const columnFieldFormats = fieldFormats?.pivotColumnFields;

  const columns = React.useMemo<ColumnDef<PivotRow>[]>(
    () => [
      {
        id: "__row_label",
        header: rowHeaderLabel,
        accessorFn: (row) => pivotRowLabel(table, row, dateFormat, rowFieldFormats),
        meta: {
          align: "left",
          label: rowHeaderLabel,
          minWidth: "min-w-[10rem]",
          sticky: true,
          truncate: true,
        } satisfies PivotColumnMeta,
        sortingFn: (rowA, rowB, columnId) => comparePivotValues(rowA.getValue(columnId), rowB.getValue(columnId)),
        cell: ({ getValue }) => String(getValue() ?? "—"),
      },
      ...table.columns.map<ColumnDef<PivotRow>>((column) => {
        const label = pivotColumnLabel(table, column, dateFormat, columnFieldFormats);
        return {
          id: column.key,
          header: label,
          accessorFn: (row) => row.cells[column.key],
          meta: {
            align: "right",
            label,
            minWidth: valueColMin,
          } satisfies PivotColumnMeta,
          sortingFn: (rowA, rowB, columnId) => comparePivotValues(rowA.getValue(columnId), rowB.getValue(columnId)),
          cell: ({ getValue }) => formatPivotNumericValue(getValue() as number | null | undefined, valueFormat),
        };
      }),
      ...(hasTotals
        ? [
            {
              id: "__total",
              header: "Total",
              accessorFn: (row: PivotRow) => row.total,
              meta: {
                align: "right",
                label: "Total",
                minWidth: valueColMin,
                total: true,
              } satisfies PivotColumnMeta,
              sortingFn: (rowA, rowB, columnId) => comparePivotValues(rowA.getValue(columnId), rowB.getValue(columnId)),
              cell: ({ getValue }) => formatPivotNumericValue(getValue() as number | null | undefined, valueFormat),
            } satisfies ColumnDef<PivotRow>,
          ]
        : []),
    ],
    [columnFieldFormats, dateFormat, hasTotals, rowFieldFormats, rowHeaderLabel, table, valueColMin, valueFormat],
  );

  // TanStack Table exposes mutable instance helpers; keep the instance local to this render path.
  // eslint-disable-next-line react-hooks/incompatible-library
  const tableModel = useReactTable({
    data: table.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.row_key,
  });

  const tableContent = (
      <div className={cn("overflow-x-auto", !embedded && "border-t border-border/70")}>
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            {tableModel.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-muted/50">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as PivotColumnMeta;
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      title={meta.label}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                      }
                      className={cn(
                        meta.minWidth,
                        "border-b border-border/70 px-3 py-2.5 text-xs font-semibold leading-none text-foreground whitespace-nowrap",
                        meta.truncate && "max-w-[14rem] truncate",
                        meta.align === "right" ? "text-right" : "text-left",
                        meta.sticky && "sticky left-0 z-10 border-r border-border/70 bg-muted/50",
                        meta.total && "bg-muted/30",
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30",
                          meta.align === "right" ? "justify-end" : "justify-start",
                        )}
                      >
                        <span className={cn(meta.truncate && "truncate")}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        {sorted === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-45" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {tableModel.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-border/50">
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as PivotColumnMeta;
                  const display = String(cell.getValue() ?? "—");

                  return (
                    <td
                      key={cell.id}
                      title={meta.align === "left" && display !== "—" ? display : undefined}
                      className={cn(
                        meta.minWidth,
                        "px-3 py-2 whitespace-nowrap",
                        meta.align === "right"
                          ? "text-right font-mono text-xs tabular-nums text-muted-foreground"
                          : "font-medium text-foreground",
                        meta.sticky && "sticky left-0 z-10 max-w-[14rem] truncate border-r border-border/50 bg-background",
                        meta.total && "bg-muted/20 font-medium text-foreground",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {table.column_totals ? (
              <tr className="border-t border-border/70 bg-muted/30 font-medium">
                {tableModel.getVisibleLeafColumns().map((column) => {
                  const meta = column.columnDef.meta as PivotColumnMeta;
                  const value =
                    column.id === "__row_label"
                      ? "Total"
                      : column.id === "__total"
                        ? formatPivotNumericValue(table.grand_total, valueFormat)
                        : formatPivotNumericValue(table.column_totals?.[column.id], valueFormat);

                  return (
                    <td
                      key={column.id}
                      className={cn(
                        meta.minWidth,
                        "px-3 py-2 whitespace-nowrap",
                        meta.align === "right" ? "text-right font-mono text-xs tabular-nums text-foreground" : "text-foreground",
                        meta.sticky && "sticky left-0 z-10 border-r border-border/70 bg-muted/30",
                      )}
                    >
                      {value}
                    </td>
                  );
                })}
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
