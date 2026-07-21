"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { AnalyticsPivotGrid } from "@/lib/analytics-studio/pivot";

/**
 * Pivot renderer styled to match Build a Table: sticky gray-50 header,
 * light gray cell borders, row hover, and frozen non-metric columns.
 * Double-click a measure label to rename it.
 */
export function AnalyticsPivotTable({
  grid,
  onRenameMeasure,
}: {
  grid: AnalyticsPivotGrid;
  onRenameMeasure?: (measureKey: string, label: string) => void;
}) {
  const tableRef = React.useRef<HTMLTableElement>(null);
  const [leftOffsets, setLeftOffsets] = React.useState<number[]>([]);
  const [editing, setEditing] = React.useState<{
    measureKey: string;
    value: string;
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table || grid.frozenColumnCount <= 0) {
      setLeftOffsets([]);
      return;
    }

    const measure = () => {
      const headerCells = table.querySelectorAll("thead th");
      const offsets: number[] = [];
      let left = 0;
      for (let i = 0; i < grid.frozenColumnCount; i++) {
        offsets.push(left);
        const cell = headerCells[i] as HTMLElement | undefined;
        left += cell?.getBoundingClientRect().width ?? 0;
      }
      setLeftOffsets((prev) => {
        if (
          prev.length === offsets.length
          && prev.every((value, index) => Math.abs(value - offsets[index]) < 0.5)
        ) {
          return prev;
        }
        return offsets;
      });
    };

    measure();

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measure)
      : null;
    observer?.observe(table);
    return () => observer?.disconnect();
  }, [grid.frozenColumnCount, grid.headers, grid.rows]);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const frozenStyle = (colIndex: number, isHeader: boolean): React.CSSProperties | undefined => {
    if (colIndex >= grid.frozenColumnCount || leftOffsets.length === 0) return undefined;
    return {
      position: "sticky",
      left: leftOffsets[colIndex] ?? 0,
      zIndex: isHeader ? 30 : 20,
    };
  };

  const isLastFrozen = (colIndex: number) =>
    grid.frozenColumnCount > 0 && colIndex === grid.frozenColumnCount - 1;

  const startRename = (measureKey: string, currentLabel: string, event: React.MouseEvent) => {
    if (!onRenameMeasure) return;
    event.preventDefault();
    event.stopPropagation();
    setEditing({ measureKey, value: currentLabel });
  };

  const commitRename = () => {
    if (!editing || !onRenameMeasure) {
      setEditing(null);
      return;
    }
    const next = editing.value.trim();
    onRenameMeasure(editing.measureKey, next);
    setEditing(null);
  };

  const cancelRename = () => setEditing(null);

  const renderEditableLabel = (measureKey: string | undefined, label: string) => {
    if (editing && measureKey && editing.measureKey === measureKey) {
      return (
        <input
          ref={inputRef}
          value={editing.value}
          onChange={(event) => setEditing({ ...editing, value: event.target.value })}
          onBlur={commitRename}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitRename();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelRename();
            }
          }}
          className="h-6 w-full min-w-[5rem] rounded-md border border-gray-300 bg-white px-1.5 text-xs font-medium text-gray-800 outline-none ring-0 focus:border-gray-400"
        />
      );
    }
    return label;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          ref={tableRef}
          className="w-full min-w-max border-collapse text-left text-xs"
        >
          <thead className="sticky top-0 z-40 bg-gray-50">
            <tr>
              {grid.headers.map((header, index) => (
                <th
                  key={index}
                  className={cn(
                    "whitespace-nowrap border-b border-gray-100 px-3 py-2 font-medium text-gray-600",
                    header.align === "right" ? "text-right" : "text-left",
                    header.frozen && "bg-gray-50",
                    isLastFrozen(index) && "border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
                    header.measureKey && onRenameMeasure && "cursor-text",
                  )}
                  style={header.frozen ? frozenStyle(index, true) : undefined}
                  title={header.measureKey && onRenameMeasure ? "Double-click to rename" : undefined}
                  onDoubleClick={
                    header.measureKey
                      ? (event) => startRename(header.measureKey!, header.label, event)
                      : undefined
                  }
                >
                  {renderEditableLabel(header.measureKey, header.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="group/row hover:bg-gray-50/80">
                {row.map((cell, cellIndex) =>
                  cell.header ? (
                    <th
                      key={`${rowIndex}-${cell.colIndex}-${cellIndex}`}
                      scope="row"
                      rowSpan={cell.rowSpan}
                      className={cn(
                        "whitespace-nowrap border-b border-gray-50 bg-white px-3 py-1.5 text-left align-top font-medium text-gray-800 group-hover/row:bg-gray-50/80",
                        isLastFrozen(cell.colIndex)
                          && "border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
                        cell.measureKey && onRenameMeasure && "cursor-text",
                      )}
                      style={{
                        ...(cell.frozen ? frozenStyle(cell.colIndex, false) : undefined),
                        ...(cell.background ? { backgroundColor: cell.background } : undefined),
                      }}
                      title={cell.measureKey && onRenameMeasure ? "Double-click to rename" : undefined}
                      onDoubleClick={
                        cell.measureKey
                          ? (event) => startRename(cell.measureKey!, cell.text, event)
                          : undefined
                      }
                    >
                      {renderEditableLabel(cell.measureKey, cell.text)}
                    </th>
                  ) : (
                    <td
                      key={`${rowIndex}-${cell.colIndex}-${cellIndex}`}
                      className={cn(
                        "whitespace-nowrap border-b border-gray-50 px-3 py-1.5 text-gray-800",
                        cell.align === "right" ? "text-right tabular-nums" : "text-left",
                      )}
                      style={cell.background ? { backgroundColor: cell.background } : undefined}
                    >
                      {cell.bar ? (
                        <span className="relative block">
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 -my-0.5 rounded-sm"
                            style={{
                              width: `${Math.round(cell.bar.fraction * 100)}%`,
                              backgroundColor: cell.bar.color,
                            }}
                          />
                          <span className="relative">{cell.text}</span>
                        </span>
                      ) : (
                        cell.text
                      )}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grid.truncated ? (
        <p className="shrink-0 border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-500">
          Showing the first rows and columns — add filters to narrow things down.
        </p>
      ) : null}
    </div>
  );
}
