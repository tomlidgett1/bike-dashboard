"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  buildCsvSerperSearchQuery,
  headersAtRow,
  inferRowLabel,
  parseCsv,
  parseSohFromColumn,
  parseSohFromValues,
  sampleValueFromColumn,
  suggestSearchColumn,
  suggestSohColumn,
} from "@/lib/store/online-products-csv-parse";
import { OnlineProductsGenerationTooltip } from "@/components/settings/online-products-generation-guide";
import {
  OptimiseBulkBar,
  OptimiseCenteredState,
  OptimiseLoadingState,
} from "@/components/optimize/optimize-layout";

const HEADER_PREVIEW_MAX_ROWS = 20;

const CSV_IMPORT_DIALOG_CLASS =
  "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out flex h-[min(90dvh,44rem)] max-h-[90dvh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-md bg-white p-0 sm:max-w-5xl";

export interface CsvImportMeta {
  id: string;
  fileName: string;
  headers: string[];
  sohColumn: string | null;
  searchColumn: string | null;
  imageSearchBicycleContext: boolean;
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

export interface CsvPhotosPayload {
  importId: string;
  headers: string[];
  sohColumn: string | null;
  searchColumn: string | null;
  imageSearchBicycleContext: boolean;
  items: EnrichedFromCsv[];
  rows: CsvImportTableRow[];
}

interface Props {
  onError: (message: string | null) => void;
  wizardMode?: boolean;
  wizardStep?: "import" | "copy";
  onImportComplete?: () => void;
  onReadyForPhotos?: (payload: CsvPhotosPayload) => void;
  onBackToImport?: () => void;
}

interface ListingCreateSummary {
  created: number;
  skippedDuplicates: number;
  errors: string[];
}

function enrichedRowToProduct(row: CsvImportTableRow): EnrichedFromCsv | null {
  if (row.status !== "enriched" || !row.enriched || typeof row.enriched !== "object") {
    return null;
  }
  const e = row.enriched as Record<string, unknown>;
  const name = typeof e.name === "string" ? e.name.trim() : "";
  if (!name) return null;
  return {
    csvRowId: row.id,
    rowIndex: row.rowIndex,
    name,
    brand: typeof e.brand === "string" ? e.brand : "",
    price: typeof e.price === "number" && Number.isFinite(e.price) ? e.price : null,
    soh: typeof e.soh === "number" && Number.isFinite(e.soh) ? e.soh : null,
    category: typeof e.category === "string" && e.category.trim() ? e.category : "Parts",
    subcategory:
      typeof e.subcategory === "string" && e.subcategory.trim() ? e.subcategory : "Other",
    description: typeof e.description === "string" ? e.description : "",
    specs: typeof e.specs === "string" ? e.specs : "",
    isDuplicate: false,
    duplicateOfId: null,
    duplicateOfName: null,
  };
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
  onError,
  wizardMode = false,
  wizardStep = "import",
  onImportComplete,
  onReadyForPhotos,
  onBackToImport,
}: Props) {
  const router = useRouter();
  const [imports, setImports] = React.useState<CsvImportMeta[]>([]);
  const [activeImportId, setActiveImportId] = React.useState<string | null>(null);
  const [activeImport, setActiveImport] = React.useState<CsvImportMeta | null>(null);
  const [rows, setRows] = React.useState<CsvImportTableRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [enriching, setEnriching] = React.useState(false);
  const [creatingListings, setCreatingListings] = React.useState(false);
  const [enrichProgress, setEnrichProgress] = React.useState<string | null>(null);
  const [listingSummary, setListingSummary] = React.useState<ListingCreateSummary | null>(null);
  const [expandedRowId, setExpandedRowId] = React.useState<string | null>(null);
  const [rowViewTab, setRowViewTab] = React.useState<RowViewTab>("all");
  const [pendingUpload, setPendingUpload] = React.useState<{
    file: File;
    parsedRows: string[][];
  } | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = React.useState(0);
  const [importDialogStep, setImportDialogStep] = React.useState<"header" | "columns">("header");
  const [sohColumn, setSohColumn] = React.useState<string>("");
  const [searchColumn, setSearchColumn] = React.useState<string>("");
  const [imageSearchBicycleContext, setImageSearchBicycleContext] = React.useState(false);
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
    const nextRows = (data.rows ?? []) as CsvImportTableRow[];
    setRows(nextRows);
    setRowViewTab("all");
    return { import: data.import as CsvImportMeta, rows: nextRows };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await loadImports();
        if (cancelled) return;
        if (list.length > 0 && !(wizardMode && wizardStep === "import")) {
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
      setImportDialogStep("header");
      const headers = headersAtRow(parsedRows, 0);
      setSohColumn(suggestSohColumn(headers) ?? "");
      setSearchColumn(suggestSearchColumn(headers) ?? "");
      setImageSearchBicycleContext(false);
      setPendingUpload({ file, parsedRows });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not read CSV");
    }
  };

  const handleUpload = async (
    file: File,
    headerIndex: number,
    sohCol: string,
    searchCol: string,
    bicycleContext: boolean,
  ) => {
    setUploading(true);
    onError(null);
    try {
      const fd = new FormData();
      fd.append("csv", file);
      fd.append("headerRowIndex", String(headerIndex));
      if (sohCol.trim()) fd.append("sohColumn", sohCol.trim());
      if (searchCol.trim()) fd.append("searchColumn", searchCol.trim());
      fd.append("imageSearchBicycleContext", bicycleContext ? "true" : "false");
      const res = await fetch("/api/store/online-products/csv-imports", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      await loadImports();
      setActiveImportId(data.import.id);
      setActiveImport(data.import);
      setRows(data.rows ?? []);
      setPendingUpload(null);
      if (wizardMode) onImportComplete?.();
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
    void handleUpload(
      pendingUpload.file,
      headerRowIndex,
      sohColumn,
      searchColumn,
      imageSearchBicycleContext,
    );
  };

  const dismissPendingUpload = () => {
    if (uploading) return;
    setPendingUpload(null);
    setImportDialogStep("header");
    onError(null);
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

  const createListingsFromEnriched = React.useCallback(
    async (items: EnrichedFromCsv[]) => {
      if (items.length === 0) return null;

      setCreatingListings(true);
      onError(null);

      try {
        const headers = activeImport?.headers ?? [];
        const res = await fetch("/api/store/online-products/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            products: items.map((p) => {
              const row = rows.find((r) => r.id === p.csvRowId);
              const preferredSoh =
                activeImport?.sohColumn ?? (sohColumn.trim() || null);
              const sohFromCsv =
                row && headers.length > 0
                  ? parseSohFromColumn(row.rawValues, preferredSoh) ??
                    parseSohFromValues(row.rawValues, headers, preferredSoh)
                  : null;
              return {
                name: p.name,
                brand: p.brand || null,
                price: p.price,
                soh: p.soh ?? sohFromCsv,
                catalogDescription: row?.displayLabel || null,
                description: p.description || null,
                specs: p.specs || null,
                category: p.category || "Parts",
                subcategory: p.subcategory || "Other",
                selectedCandidates: [],
                primaryUrl: "",
              };
            }),
            onlineOnly: false,
            csvLinks: items.map((p) => ({ csvRowId: p.csvRowId })),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to create listings");
        }

        return {
          created: typeof data.created === "number" ? data.created : 0,
          skippedDuplicates:
            typeof data.skippedDuplicates === "number" ? data.skippedDuplicates : 0,
          errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
        } satisfies ListingCreateSummary;
      } finally {
        setCreatingListings(false);
      }
    },
    [activeImport?.headers, activeImport?.sohColumn, onError, rows, sohColumn],
  );

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
        onError("No new products to optimise — selected rows are duplicates or were skipped.");
        return;
      }

      if (wizardMode && onReadyForPhotos && activeImportId) {
        const refreshed = activeImportId ? await loadImport(activeImportId) : null;
        const importMeta = refreshed?.import ?? activeImport;
        const freshRows = refreshed?.rows ?? rows;
        const enrichedItems = freshRows
          .map(enrichedRowToProduct)
          .filter((p): p is EnrichedFromCsv => p !== null);
        if (!importMeta || enrichedItems.length === 0) {
          onError("Enrichment finished but no rows are ready. Try again.");
          return;
        }
        onReadyForPhotos({
          importId: activeImportId,
          headers: importMeta.headers,
          sohColumn: importMeta.sohColumn ?? (sohColumn.trim() || null),
          searchColumn: importMeta.searchColumn ?? (searchColumn.trim() || null),
          imageSearchBicycleContext:
            importMeta.imageSearchBicycleContext ?? imageSearchBicycleContext,
          items: enrichedItems,
          rows: freshRows,
        });
        return;
      }

      const summary = await createListingsFromEnriched(nonDuplicates);
      if (activeImportId) await loadImport(activeImportId);

      if (summary) {
        if (summary.created === 0 && summary.errors.length > 0) {
          onError(summary.errors[0] ?? "No listings were created.");
          return;
        }
        setListingSummary(summary);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnriching(false);
      setEnrichProgress(null);
    }
  };

  const continueToPhotos = () => {
    if (!wizardMode || !onReadyForPhotos || !activeImportId || !activeImport) return;
    const enrichedItems = rows
      .map(enrichedRowToProduct)
      .filter((p): p is EnrichedFromCsv => p !== null);
    if (enrichedItems.length === 0) {
      onError("No enriched rows yet. Select rows and run Optimise copy first.");
      return;
    }
    onReadyForPhotos({
      importId: activeImportId,
      headers: activeImport.headers,
      sohColumn: activeImport.sohColumn ?? (sohColumn.trim() || null),
      searchColumn: activeImport.searchColumn ?? (searchColumn.trim() || null),
      imageSearchBicycleContext:
        activeImport.imageSearchBicycleContext ?? imageSearchBicycleContext,
      items: enrichedItems,
      rows,
    });
  };

  const handleCreateListings = async () => {
    const items = rows
      .map(enrichedRowToProduct)
      .filter((p): p is EnrichedFromCsv => p !== null);
    if (items.length === 0) {
      onError("No enriched rows ready to create as listings.");
      return;
    }
    try {
      const summary = await createListingsFromEnriched(items);
      if (activeImportId) await loadImport(activeImportId);
      if (summary) {
        if (summary.created === 0 && summary.errors.length > 0) {
          onError(summary.errors[0] ?? "No listings were created.");
          return;
        }
        setListingSummary(summary);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create listings");
    }
  };

  const selectedCount = rows.filter((r) => r.isSelected).length;
  const readyToCreateCount = rows.filter((r) => r.status === "enriched").length;
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

  React.useEffect(() => {
    if (!pendingUpload) return;
    const headers = headersAtRow(pendingUpload.parsedRows, headerRowIndex);
    const suggestedSoh = suggestSohColumn(headers);
    const suggestedSearch = suggestSearchColumn(headers);
    setSohColumn((prev) => {
      if (prev && headers.includes(prev)) return prev;
      return suggestedSoh ?? "";
    });
    setSearchColumn((prev) => {
      if (prev && headers.includes(prev)) return prev;
      return suggestedSearch ?? "";
    });
  }, [pendingUpload, headerRowIndex]);

  const sohSample = pendingUpload
    ? sampleValueFromColumn(pendingUpload.parsedRows, headerRowIndex, sohColumn)
    : null;
  const searchSample = pendingUpload
    ? sampleValueFromColumn(pendingUpload.parsedRows, headerRowIndex, searchColumn)
    : null;
  const previewNameSample = pendingUpload
    ? (() => {
        const dataRow = pendingUpload.parsedRows[headerRowIndex + 1];
        if (!dataRow || previewHeaders.length === 0) return null;
        const values: Record<string, string> = {};
        previewHeaders.forEach((header, index) => {
          values[header] = dataRow[index] ?? "";
        });
        return inferRowLabel(values, previewHeaders);
      })()
    : null;
  const previewSerperQuery = pendingUpload
    ? buildCsvSerperSearchQuery({
        searchColumnValue: searchSample,
        name: previewNameSample ?? undefined,
        bicycleContext: imageSearchBicycleContext,
      })
    : "";

  if (loading) {
    return <OptimiseLoadingState label="Loading saved CSV imports…" />;
  }

  if (listingSummary) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-border/60 bg-white py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">
            {listingSummary.created} listing{listingSummary.created === 1 ? "" : "s"} created
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            Saved as manual listings in Products. Optimise images in Photos and polish descriptions
            in Copy when you are ready.
          </p>
          {listingSummary.skippedDuplicates > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {listingSummary.skippedDuplicates} skipped as duplicates of existing store products.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={() => router.push("/products?source=manual")}>
            View products
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/optimize?source=catalogue")}>
            Optimise more
          </Button>
          <Button size="sm" variant="outline" onClick={() => setListingSummary(null)}>
            Back to CSV
          </Button>
        </div>
      </div>
    );
  }

  const showImportToolbar = !wizardMode || wizardStep === "import";
  const showCopyToolbar = !wizardMode || wizardStep === "copy";
  const showRowTable = !wizardMode || wizardStep === "copy";
  const showImportToolbarUI = showImportToolbar && !(wizardMode && !activeImport);

  const csvFileInput = (
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
  );

  const openCsvFilePicker = () => fileRef.current?.click();

  return (
    <div className="space-y-0">
      {csvFileInput}
      {!wizardMode && (
        <div className="rounded-md border border-border/60 bg-white px-4 py-3 text-sm text-muted-foreground">
          CSV rows are saved as <span className="font-medium text-foreground">manual / other</span>{" "}
          listings in Products. Use the Photos and Copy tabs to add images and polish descriptions.
        </div>
      )}

      {(showImportToolbarUI || showCopyToolbar) && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3",
            wizardMode ? "pb-3" : "border-b border-border/60 py-3",
          )}
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {showImportToolbar && (
              <>
                {imports.length > 0 && !wizardMode && (
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={openCsvFilePicker}
                >
                  {uploading ? (
                    <><Loader2 className="size-4 animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload className="size-4" /> Upload CSV</>
                  )}
                </Button>
                {activeImportId && !wizardMode && (
                  <Button size="sm" variant="ghost" onClick={() => void handleDeleteImport()}>
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                )}
              </>
            )}
            {showCopyToolbar && activeImport && (
              <span className="text-sm text-muted-foreground">
                {activeImport.fileName} · {activeImport.rowCount} rows
                {activeImport.sohColumn ? ` · SOH: ${activeImport.sohColumn}` : ""}
                {activeImport.searchColumn ? ` · Search: ${activeImport.searchColumn}` : ""}
              </span>
            )}
            {!wizardMode && <OnlineProductsGenerationTooltip />}
          </div>
          {showCopyToolbar && activeImport && (
            <>
              {!wizardMode && readyToCreateCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCreateListings()}
                  disabled={enriching || creatingListings}
                >
                  {creatingListings ? (
                    <><Loader2 className="size-4 animate-spin" /> Creating listings…</>
                  ) : (
                    <>Create {readyToCreateCount} listing{readyToCreateCount === 1 ? "" : "s"}</>
                  )}
                </Button>
              )}
              {wizardMode && pendingEnrichCount === 0 && enrichedCount > 0 ? (
                <Button size="sm" onClick={continueToPhotos}>
                  Continue to photos ({enrichedCount})
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void handleEnrich()}
                  disabled={
                    enriching ||
                    creatingListings ||
                    (pendingEnrichCount === 0 && enrichedCount === 0)
                  }
                >
                  {enriching ? (
                    <><Loader2 className="size-4 animate-spin" /> {enrichProgress ?? "Optimising…"}</>
                  ) : wizardMode ? (
                    <><Sparkles className="size-4" /> Optimise copy ({pendingEnrichCount || selectedCount})</>
                  ) : (
                    <><Sparkles className="size-4" /> Optimise selected with AI ({pendingEnrichCount || selectedCount})</>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(pendingUpload)}
        onOpenChange={(open) => {
          if (!open) dismissPendingUpload();
        }}
      >
        <DialogContent
          className={CSV_IMPORT_DIALOG_CLASS}
          overlayClassName="duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          showCloseButton={!uploading}
          onInteractOutside={(event) => {
            if (uploading) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (uploading) event.preventDefault();
          }}
        >
          {pendingUpload ? (
            <>
              <DialogHeader className="shrink-0 space-y-3 border-b border-border/60 px-6 py-4 text-left">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-base">Import CSV</DialogTitle>
                    <DialogDescription className="text-left">
                      {importDialogStep === "header"
                        ? "Step 1 — pick the row that contains your column titles."
                        : "Step 2 — map columns used for stock and image search."}
                      {" "}
                      <span className="font-medium text-foreground">{pendingUpload.file.name}</span>
                    </DialogDescription>
                  </div>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit shrink-0">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => setImportDialogStep("header")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        importDialogStep === "header"
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70",
                      )}
                    >
                      1. Header
                    </button>
                    <button
                      type="button"
                      disabled={uploading || previewDataRowCount < 1}
                      onClick={() => setImportDialogStep("columns")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        importDialogStep === "columns"
                          ? "text-gray-800 bg-white shadow-sm"
                          : previewDataRowCount < 1
                            ? "text-muted-foreground cursor-not-allowed opacity-50"
                            : "text-gray-600 hover:bg-gray-200/70",
                      )}
                    >
                      2. Columns
                    </button>
                  </div>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
                {importDialogStep === "columns" ? (
                  <div className="flex h-full min-h-[12rem] flex-col gap-4 overflow-auto">
                    <div className="rounded-md border border-border/60 bg-white p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Stock on hand (SOH)</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Quantity available when each listing is created. Leave unset if your file
                          has no stock column.
                        </p>
                      </div>
                      <Select
                        value={sohColumn || "__none__"}
                        onValueChange={(value) =>
                          setSohColumn(value === "__none__" ? "" : value)
                        }
                        disabled={uploading}
                      >
                        <SelectTrigger className="h-9 w-full rounded-md text-sm">
                          <SelectValue placeholder="Choose SOH column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Not in this file</SelectItem>
                          {previewHeaders.map((header) => (
                            <SelectItem key={`soh-${header}`} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {sohColumn && (
                        <p className="text-xs text-muted-foreground">
                          Example from first row:{" "}
                          <span className="font-medium text-foreground">
                            {sohSample ?? "—"}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="rounded-md border border-border/60 bg-white p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Part number / search key
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Serper uses this value first when finding product images — ideal for SKU,
                          MPN, UPC, or catalogue numbers. Works for non-bicycle catalogues too.
                        </p>
                      </div>
                      <Select
                        value={searchColumn || "__none__"}
                        onValueChange={(value) =>
                          setSearchColumn(value === "__none__" ? "" : value)
                        }
                        disabled={uploading}
                      >
                        <SelectTrigger className="h-9 w-full rounded-md text-sm">
                          <SelectValue placeholder="Choose search column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Use product title only</SelectItem>
                          {previewHeaders.map((header) => (
                            <SelectItem key={`search-${header}`} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {searchColumn && (
                        <p className="text-xs text-muted-foreground">
                          Example from first row:{" "}
                          <span className="font-medium text-foreground">
                            {searchSample ?? "—"}
                          </span>
                        </p>
                      )}
                      {!searchColumn && (
                        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-white px-3 py-2">
                          <Checkbox
                            id="csv-bicycle-context"
                            checked={imageSearchBicycleContext}
                            onCheckedChange={(checked) =>
                              setImageSearchBicycleContext(checked === true)
                            }
                            disabled={uploading}
                          />
                          <Label
                            htmlFor="csv-bicycle-context"
                            className="text-xs font-normal leading-snug text-muted-foreground"
                          >
                            Add cycling context to image search (turn off for general / non-bike
                            catalogues)
                          </Label>
                        </div>
                      )}
                      {previewSerperQuery && (
                        <p className="text-xs text-muted-foreground">
                          Sample image search:{" "}
                          <span className="font-medium text-foreground">{previewSerperQuery}</span>
                        </p>
                      )}
                    </div>

                    <div className="rounded-md border border-border/60 bg-white px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{previewDataRowCount}</span>{" "}
                      product row{previewDataRowCount === 1 ? "" : "s"} ·{" "}
                      {previewHeaders.length} column{previewHeaders.length === 1 ? "" : "s"}
                    </div>
                  </div>
                ) : (
                <>
                <div className="flex h-full min-h-[12rem] flex-col overflow-hidden rounded-md border border-border/60 bg-white">
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full min-w-max text-sm border-collapse">
                      <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 backdrop-blur-sm">
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
                                        ? "text-gray-600 hover:bg-gray-200/70"
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
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing first {HEADER_PREVIEW_MAX_ROWS} of {pendingUpload.parsedRows.length}{" "}
                    non-empty rows.
                  </p>
                )}
                </>
                )}
              </div>

              <div className="shrink-0 border-t border-border/60 bg-white px-6 py-4">
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={dismissPendingUpload}
                  >
                    Cancel
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    {importDialogStep === "columns" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={uploading}
                        onClick={() => setImportDialogStep("header")}
                      >
                        Back
                      </Button>
                    )}
                    {importDialogStep === "header" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={uploading || previewDataRowCount < 1}
                        onClick={() => setImportDialogStep("columns")}
                      >
                        Continue
                      </Button>
                    ) : (
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
                    )}
                  </div>
                </DialogFooter>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {activeImport && showRowTable ? (
        <div className="space-y-0">
          {!wizardMode && (
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
                    Select rows, run AI optimisation, then listings are created automatically. Your
                    selection is saved automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

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
                        No duplicates in this import. Duplicates are flagged when a row matches an
                        existing store product or another row in the same file.
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
          onClick={openCsvFilePicker}
        >
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Upload a product CSV</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Upload your supplier sheet and pick the header row. Use the help icon for what each step generates.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={(e) => {
              e.stopPropagation();
              openCsvFilePicker();
            }}
          >
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
