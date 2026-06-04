"use client";

import * as React from "react";
import {
  AlertCircle,
  ChevronDown,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { headersAtRow, parseCsv } from "@/lib/store/online-products-csv-parse";
import { OnlineProductsGenerationTooltip } from "@/components/settings/online-products-generation-guide";
import {
  OptimiseBulkBar,
  OptimiseCenteredState,
  OptimiseLoadingState,
} from "@/components/optimize/optimize-layout";

const HEADER_PREVIEW_MAX_ROWS = 20;

export interface CsvImportMeta {
  id: string;
  fileName: string;
  headers: string[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CsvImportTableRow {
  id: string;
  rowIndex: number;
  displayLabel: string;
  rawValues: Record<string, string>;
  isSelected: boolean;
  status: string;
  enriched: Record<string, unknown> | null;
  duplicateOfId: string | null;
  duplicateOfName: string | null;
  skipReason: string | null;
  createdProductId: string | null;
}

export interface EnrichedFromCsv {
  csvRowId: string;
  rowIndex: number;
  name: string;
  brand: string;
  price: number | null;
  soh: number | null;
  category: string;
  subcategory: string;
  description: string;
  specs: string;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  duplicateOfName: string | null;
}

interface Props {
  onEnriched: (products: EnrichedFromCsv[]) => void;
  onError: (message: string | null) => void;
  onlineOnlyBadge: boolean;
  onOnlineOnlyBadgeChange: (value: boolean) => void;
}

export function OnlineOnlyBadgeToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Online Only badge</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {value
            ? "Created listings show the Online Only badge on the marketplace."
            : "Created listings are normal store inventory without the Online Only badge."}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={value ? "default" : "outline"}
        disabled={disabled}
        onClick={() => onChange(!value)}
      >
        {value ? "Badge on" : "Badge off"}
      </Button>
    </div>
  );
}

type RowViewTab = "all" | "duplicates";

function isDuplicateRow(row: CsvImportTableRow) {
  return (
    row.status === "duplicate" ||
    Boolean(row.duplicateOfId || row.duplicateOfName)
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "enriched":
      return "Enriched";
    case "duplicate":
      return "Duplicate";
    case "skipped":
      return "Skipped";
    case "created":
      return "Created";
    default:
      return "Pending";
  }
}

export function StoreOnlineProductsCsvPanel({
  onEnriched,
  onError,
  onlineOnlyBadge,
  onOnlineOnlyBadgeChange,
}: Props) {
  const [imports, setImports] = React.useState<CsvImportMeta[]>([]);
  const [activeImportId, setActiveImportId] = React.useState<string | null>(null);
  const [activeImport, setActiveImport] = React.useState<CsvImportMeta | null>(null);
  const [rows, setRows] = React.useState<CsvImportTableRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [enriching, setEnriching] = React.useState(false);
  const [enrichProgress, setEnrichProgress] = React.useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = React.useState<string | null>(null);
  const [rowViewTab, setRowViewTab] = React.useState<RowViewTab>("all");
  const [pendingUpload, setPendingUpload] = React.useState<{
    file: File;
    parsedRows: string[][];
  } | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadImports = React.useCallback(async () => {
    const res = await fetch("/api/store/online-products/csv-imports");
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Failed to load imports");
    setImports(data.imports ?? []);
    return data.imports as CsvImportMeta[];
  }, []);

  const loadImport = React.useCallback(async (importId: string) => {
    const res = await fetch(`/api/store/online-products/csv-imports/${importId}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Failed to load import");
    setActiveImportId(importId);
    setActiveImport(data.import);
    setRows(data.rows ?? []);
    setRowViewTab("all");
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await loadImports();
        if (cancelled) return;
        if (list.length > 0) {
          await loadImport(list[0].id);
        }
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : "Failed to load CSV imports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const persistSelection = React.useCallback(
    (selections: Array<{ rowId: string; selected: boolean }>) => {
      if (!activeImportId || selections.length === 0) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/store/online-products/csv-imports/${activeImportId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selections }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || "Failed to save selection");
          setRows(data.rows ?? []);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Failed to save selection");
        }
      }, 400);
    },
    [activeImportId, onError],
  );

  const toggleRow = (rowId: string, selected: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, isSelected: selected } : r)));
    persistSelection([{ rowId, selected }]);
  };

  const toggleAll = async (selected: boolean) => {
    if (!activeImportId) return;
    try {
      const res = await fetch(`/api/store/online-products/csv-imports/${activeImportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectAll: true, selected, onlyPending: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update selection");
      setRows(data.rows ?? []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update selection");
    }
  };

  const handleFileChosen = async (file: File) => {
    onError(null);
    try {
      const parsedRows = parseCsv(await file.text());
      if (parsedRows.length < 2) {
        onError("CSV needs at least two non-empty rows (a header row and product data).");
        return;
      }
      setHeaderRowIndex(0);
      setPendingUpload({ file, parsedRows });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not read CSV");
    }
  };

  const handleUpload = async (file: File, headerIndex: number) => {
    setUploading(true);
    onError(null);
    try {
      const fd = new FormData();
      fd.append("csv", file);
      fd.append("headerRowIndex", String(headerIndex));
      const res = await fetch("/api/store/online-products/csv-imports", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      await loadImports();
      setActiveImportId(data.import.id);
      setActiveImport(data.import);
      setRows(data.rows ?? []);
      setPendingUpload(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const confirmPendingUpload = () => {
    if (!pendingUpload) return;
    const dataRowCount = pendingUpload.parsedRows.length - headerRowIndex - 1;
    if (dataRowCount < 1) {
      onError("Pick a header row that has at least one product row beneath it.");
      return;
    }
    void handleUpload(pendingUpload.file, headerRowIndex);
  };

  const handleDeleteImport = async () => {
    if (!activeImportId || !confirm("Delete this saved CSV import?")) return;
    try {
      const res = await fetch(`/api/store/online-products/csv-imports/${activeImportId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Delete failed");
      setActiveImportId(null);
      setActiveImport(null);
      setRows([]);
      const list = await loadImports();
      if (list.length > 0) {
        await loadImport(list[0].id);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleEnrich = async () => {
    if (!activeImportId) return;
    setEnriching(true);
    setEnrichProgress(null);
    onError(null);

    const selectedIds = rows
      .filter((r) => r.isSelected && !["duplicate", "created", "skipped"].includes(r.status))
      .map((r) => r.id);

    if (selectedIds.length === 0) {
      onError("Select at least one row to optimise with AI.");
      setEnriching(false);
      return;
    }

    const allProducts: EnrichedFromCsv[] = [];
    let remaining = selectedIds.length;
    let offset = 0;
    const chunkSize = 36;

    try {
      while (offset < selectedIds.length) {
        const chunk = selectedIds.slice(offset, offset + chunkSize);
        setEnrichProgress(`Optimising ${offset + 1}–${Math.min(offset + chunk.length, selectedIds.length)} of ${selectedIds.length}…`);

        const res = await fetch(`/api/store/online-products/csv-imports/${activeImportId}/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowIds: chunk }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Enrichment failed");

        if (Array.isArray(data.products)) {
          allProducts.push(...(data.products as EnrichedFromCsv[]));
        }

        remaining = data.remainingToEnrich ?? 0;
        offset += chunk.length;

        await loadImport(activeImportId);
        if (remaining <= 0 && offset >= selectedIds.length) break;
      }

      const nonDuplicates = allProducts.filter((p) => !p.isDuplicate);
      if (nonDuplicates.length === 0) {
        onError("No new products to add — selected rows are duplicates or were skipped.");
        return;
      }

      onEnriched(nonDuplicates);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnriching(false);
      setEnrichProgress(null);
    }
  };

  const selectedCount = rows.filter((r) => r.isSelected).length;
  const pendingEnrichCount = rows.filter(
    (r) => r.isSelected && !["duplicate", "created", "skipped", "enriched"].includes(r.status),
  ).length;
  const enrichedCount = rows.filter((r) => r.status === "enriched").length;
  const duplicateCount = rows.filter(isDuplicateRow).length;
  const visibleRows =
    rowViewTab === "duplicates" ? rows.filter(isDuplicateRow) : rows;
  const sheetHeaders = activeImport?.headers ?? [];

  const previewRows = pendingUpload?.parsedRows.slice(0, HEADER_PREVIEW_MAX_ROWS) ?? [];
  const previewColumnCount = previewRows.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );
  const previewHeaders = pendingUpload
    ? headersAtRow(pendingUpload.parsedRows, headerRowIndex)
    : [];
  const previewDataRowCount = pendingUpload
    ? Math.max(0, pendingUpload.parsedRows.length - headerRowIndex - 1)
    : 0;

  if (loading) {
    return <OptimiseLoadingState label="Loading saved CSV imports…" />;
  }

  return (
    <div className="space-y-0">
      <OnlineOnlyBadgeToggle
        value={onlineOnlyBadge}
        onChange={onOnlineOnlyBadgeChange}
        disabled={uploading || enriching}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {imports.length > 0 && (
            <Select
              value={activeImportId ?? undefined}
              onValueChange={(id) => void loadImport(id)}
            >
              <SelectTrigger className="h-9 w-[min(100%,280px)] rounded-md text-sm">
                <SelectValue placeholder="Saved CSV" />
              </SelectTrigger>
              <SelectContent>
                {imports.map((imp) => (
                  <SelectItem key={imp.id} value={imp.id}>
                    {imp.fileName} ({imp.rowCount} rows)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFileChosen(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="size-4 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="size-4" /> Upload CSV</>
            )}
          </Button>
          {activeImportId && (
            <Button size="sm" variant="ghost" onClick={() => void handleDeleteImport()}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
          <OnlineProductsGenerationTooltip />
        </div>
        {activeImport && (
          <Button
            size="sm"
            onClick={() => void handleEnrich()}
            disabled={enriching || pendingEnrichCount === 0}
          >
            {enriching ? (
              <><Loader2 className="size-4 animate-spin" /> {enrichProgress ?? "Optimising…"}</>
            ) : (
              <><Sparkles className="size-4" /> Optimise selected with AI ({pendingEnrichCount || selectedCount})</>
            )}
          </Button>
        )}
      </div>

      {pendingUpload && (
        <div className="space-y-4 border-b border-border/60 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">Choose header row</p>
            <p className="text-xs text-muted-foreground mt-1">
              Select the row that contains your column titles (e.g. Name, SKU, Price). Rows above it are
              ignored. File: {pendingUpload.file.name}
            </p>
          </div>

          <div className="overflow-hidden rounded-md border border-border/60">
            <div className="max-h-[min(50vh,400px)] overflow-auto">
              <table className="w-full min-w-max text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border">
                  <tr>
                    <th className="sticky left-0 z-20 w-28 min-w-28 border-r border-border bg-muted/95 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                      Header
                    </th>
                    <th className="w-12 min-w-12 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                      #
                    </th>
                    {Array.from({ length: previewColumnCount }, (_, i) => (
                      <th
                        key={`col-${i}`}
                        className="min-w-[100px] max-w-[200px] px-2 py-2 text-left text-xs font-medium text-muted-foreground"
                      >
                        Col {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((cells, rowIndex) => {
                    const isHeader = rowIndex === headerRowIndex;
                    const hasDataBelow = rowIndex < pendingUpload.parsedRows.length - 1;
                    return (
                      <tr
                        key={rowIndex}
                        className={cn(
                          "border-b border-border/60",
                          isHeader && "bg-primary/5",
                        )}
                      >
                        <td className="sticky left-0 z-[1] border-r border-border/60 bg-white px-2 py-2 align-top">
                          <button
                            type="button"
                            disabled={!hasDataBelow || uploading}
                            onClick={() => setHeaderRowIndex(rowIndex)}
                            className={cn(
                              "w-full rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                              isHeader
                                ? "bg-white text-gray-800 shadow-sm"
                                : hasDataBelow
                                  ? "text-gray-600 hover:bg-gray-100"
                                  : "text-muted-foreground cursor-not-allowed opacity-50",
                            )}
                          >
                            {isHeader ? "Header row" : "Use as header"}
                          </button>
                        </td>
                        <td className="px-2 py-2 align-top text-xs text-muted-foreground tabular-nums">
                          {rowIndex + 1}
                        </td>
                        {Array.from({ length: previewColumnCount }, (_, colIndex) => (
                          <td
                            key={`${rowIndex}-${colIndex}`}
                            className="min-w-[100px] max-w-[200px] px-2 py-2 align-top text-xs text-foreground"
                          >
                            <span className="block break-words whitespace-pre-wrap">
                              {cells[colIndex] ?? ""}
                            </span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {pendingUpload.parsedRows.length > HEADER_PREVIEW_MAX_ROWS && (
            <p className="text-xs text-muted-foreground">
              Showing first {HEADER_PREVIEW_MAX_ROWS} of {pendingUpload.parsedRows.length} non-empty rows.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Columns: </span>
            {previewHeaders.length > 0
              ? previewHeaders.join(", ")
              : "Select a header row"}
            {previewDataRowCount > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {previewDataRowCount} product row{previewDataRowCount === 1 ? "" : "s"} will be imported
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => {
                setPendingUpload(null);
                onError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={uploading || previewDataRowCount < 1}
              onClick={() => confirmPendingUpload()}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  Import {previewDataRowCount} row{previewDataRowCount === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {activeImport ? (
        <div className="space-y-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 py-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted/60">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{activeImport.fileName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeImport.rowCount} rows saved · {selectedCount} selected
                  {enrichedCount > 0 && <> · {enrichedCount} enriched</>}
                  {duplicateCount > 0 && <> · {duplicateCount} duplicates</>}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Select rows, then run AI optimisation. Your selection is saved automatically.
                </p>
              </div>
            </div>
          </div>

          <OptimiseBulkBar>
            <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                  rowViewTab === "all"
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
                onClick={() => setRowViewTab("all")}
              >
                All rows
                <span className="tabular-nums text-muted-foreground">({rows.length})</span>
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                  rowViewTab === "duplicates"
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
                onClick={() => setRowViewTab("duplicates")}
              >
                Duplicates
                <span className="tabular-nums text-muted-foreground">({duplicateCount})</span>
              </button>
            </div>
            </div>
            {rowViewTab === "all" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void toggleAll(true)}>
                  Select all eligible
                </Button>
                <Button size="sm" variant="outline" onClick={() => void toggleAll(false)}>
                  Clear selection
                </Button>
              </div>
            )}
          </OptimiseBulkBar>

          <div className="overflow-hidden rounded-md border border-border/60">
            <div className="max-h-[min(60vh,520px)] overflow-auto">
              <table className="w-full min-w-max text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border">
                  <tr>
                    <th className="sticky left-0 z-20 w-10 min-w-10 border-r border-border bg-muted/95 px-3 py-2 text-left font-medium text-muted-foreground">
                      {" "}
                    </th>
                    <th className="sticky left-10 z-20 w-14 min-w-14 border-r border-border bg-muted/95 px-2 py-2 text-left font-medium text-muted-foreground">
                      Row
                    </th>
                    {sheetHeaders.map((header) => (
                      <th
                        key={header}
                        className="min-w-[120px] max-w-[280px] px-3 py-2 text-left font-medium text-foreground whitespace-nowrap"
                      >
                        {header}
                      </th>
                    ))}
                    <th className="sticky right-0 z-20 min-w-[88px] border-l border-border bg-muted/95 px-3 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && rowViewTab === "duplicates" && (
                    <tr>
                      <td
                        colSpan={sheetHeaders.length + 3}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No duplicates in this import. Duplicates are flagged when a row matches your
                        online catalog or another row in the same file.
                      </td>
                    </tr>
                  )}
                  {visibleRows.map((row) => {
                    const isDup = isDuplicateRow(row);
                    const isExpanded = expandedRowId === row.id;
                    const disabledSelect = isDup || row.status === "created" || row.status === "skipped";
                    const enrichedSoh =
                      row.enriched &&
                      typeof row.enriched === "object" &&
                      "soh" in row.enriched &&
                      typeof (row.enriched as { soh?: unknown }).soh === "number"
                        ? (row.enriched as { soh: number }).soh
                        : null;
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className={cn(
                            "border-b border-border/60 hover:bg-muted/30",
                            isDup && "bg-amber-50/50 dark:bg-amber-950/15",
                            row.isSelected && !isDup && "bg-primary/5",
                          )}
                        >
                          <td className="sticky left-0 z-[1] border-r border-border/60 bg-white px-3 py-2 align-top">
                            <Checkbox
                              checked={row.isSelected}
                              disabled={disabledSelect || enriching}
                              onCheckedChange={(v) => toggleRow(row.id, v === true)}
                              aria-label={`Select row ${row.rowIndex}`}
                            />
                          </td>
                          <td className="sticky left-10 z-[1] border-r border-border/60 bg-white px-2 py-2 align-top text-xs text-muted-foreground tabular-nums">
                            {row.rowIndex}
                          </td>
                          {sheetHeaders.map((header) => (
                            <td
                              key={`${row.id}-${header}`}
                              className="min-w-[120px] max-w-[280px] px-3 py-2 align-top text-xs text-foreground"
                            >
                              <span className="block break-words whitespace-pre-wrap">
                                {row.rawValues[header] ?? ""}
                              </span>
                            </td>
                          ))}
                          <td className="sticky right-0 z-[1] border-l border-border/60 bg-white px-3 py-2 align-top">
                            <button
                              type="button"
                              className="text-left w-full space-y-1"
                              onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                            >
                              <span className="inline-flex rounded-md border border-border bg-white px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                {statusLabel(row.status)}
                              </span>
                              {row.duplicateOfName && (
                                <span className="block text-[10px] text-amber-900 dark:text-amber-200 line-clamp-2">
                                  {row.duplicateOfName}
                                </span>
                              )}
                              {row.skipReason && (
                                <span className="block text-[10px] text-muted-foreground line-clamp-2">
                                  {row.skipReason}
                                </span>
                              )}
                              {enrichedSoh != null && (
                                <span className="block text-[10px] text-muted-foreground tabular-nums">
                                  SOH saved: {enrichedSoh}
                                </span>
                              )}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && row.enriched && typeof row.enriched === "object" && (
                          <tr className="border-b border-border bg-muted/20">
                            <td colSpan={sheetHeaders.length + 3} className="px-4 py-3">
                              <div className="text-xs space-y-2">
                                <p className="font-medium text-foreground">AI-generated preview</p>
                                <p className="text-foreground">
                                  {String((row.enriched as { name?: string }).name ?? "")}
                                </p>
                                {(row.enriched as { brand?: string }).brand && (
                                  <p className="text-muted-foreground">
                                    Brand: {String((row.enriched as { brand?: string }).brand)}
                                  </p>
                                )}
                                {(row.enriched as { category?: string }).category && (
                                  <p className="text-muted-foreground">
                                    {String((row.enriched as { category?: string }).category)}
                                    {(row.enriched as { subcategory?: string }).subcategory
                                      ? ` / ${String((row.enriched as { subcategory?: string }).subcategory)}`
                                      : ""}
                                    {(row.enriched as { price?: number | null }).price != null && (
                                      <> · ${Number((row.enriched as { price: number }).price).toFixed(2)}</>
                                    )}
                                  </p>
                                )}
                                {(row.enriched as { description?: string }).description && (
                                  <p className="text-muted-foreground leading-relaxed line-clamp-4">
                                    {String((row.enriched as { description?: string }).description)}
                                  </p>
                                )}
                                {(row.enriched as { specs?: string }).specs && (
                                  <p className="text-muted-foreground whitespace-pre-line line-clamp-4">
                                    {String((row.enriched as { specs?: string }).specs)}
                                  </p>
                                )}
                                {enrichedSoh != null && (
                                  <p className="text-muted-foreground tabular-nums">
                                    SOH from CSV: {enrichedSoh} (not AI-estimated)
                                  </p>
                                )}
                                <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
                                  Images are not generated here — use Find images on the next screen.
                                </p>
                              </div>
                              <button
                                type="button"
                                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedRowId(null)}
                              >
                                <ChevronDown className="h-3 w-3 rotate-180" />
                                Collapse
                              </button>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <OptimiseCenteredState
          className="cursor-pointer border border-dashed border-border/60 rounded-md hover:border-primary/40"
          onClick={() => fileRef.current?.click()}
        >
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Upload a product CSV</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Upload your supplier sheet and pick the header row. Use the help icon for what each step generates.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={uploading}>
            <Upload className="size-4" />
            Choose CSV file
          </Button>
        </OptimiseCenteredState>
      )}

      {enriching && (
        <div className="flex items-start gap-2 border-b border-border/60 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin mt-0.5" />
          <span>{enrichProgress ?? "Researching selected products with web search…"}</span>
        </div>
      )}
    </div>
  );
}
