"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Header } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { cn } from "@/lib/utils";

type InventoryValue = string | number | boolean | null | Record<string, unknown> | unknown[];
type InventoryRow = Record<string, InventoryValue> & {
  id?: string;
  lightspeed_item_id?: string | null;
};

interface InventoryResponse {
  rows: InventoryRow[];
  columns: string[];
  editableFields: string[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface EditingCell {
  itemId: string;
  field: string;
}

interface TitleCleaningJob {
  id: string;
  status: string;
  total_items: number;
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
}

interface TitleCleaningQueueItem {
  id: string;
  job_id: string;
  lightspeed_item_id: string;
  status: string;
  cleaned_description: string | null;
  error_message: string | null;
}

interface TitleCleaningStatusResponse {
  job?: TitleCleaningJob;
  activeJob?: TitleCleaningJob | null;
  jobs?: TitleCleaningJob[];
  items?: TitleCleaningQueueItem[];
}

interface TitleCleaningStartResponse {
  success?: boolean;
  job?: TitleCleaningJob;
  items?: TitleCleaningQueueItem[];
  queued?: number;
  missingItemIds?: string[];
  error?: string;
}

const terminalTitleCleaningStatuses = new Set([
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

const columnLabels: Record<string, string> = {
  lightspeed_item_id: "item_id",
  lightspeed_account_id: "account_id",
  system_sku: "system_sku",
  description: "description",
  model_year: "model_year",
  upc: "upc",
  category_id: "category_id",
  manufacturer_id: "manufacturer_id",
  price: "price",
  default_cost: "default_cost",
  avg_cost: "avg_cost",
  total_qoh: "total_qoh",
  total_sellable: "total_sellable",
  stock_data: "stock_data",
  images: "images",
  primary_image_url: "primary_image_url",
  sync_batch_id: "sync_batch_id",
  last_synced_at: "last_synced_at",
  created_at: "created_at",
  updated_at: "updated_at",
};

function formatCellValue(value: InventoryValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getColumnWidth(column: string) {
  if (column === "description") return "min-w-[360px]";
  if (column === "stock_data" || column === "images") return "min-w-[420px]";
  if (column.includes("url")) return "min-w-[300px]";
  if (column.includes("_at") || column.includes("time")) return "min-w-[210px]";
  return "min-w-[150px]";
}

export default function DataSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);
  const [rows, setRows] = React.useState<InventoryRow[]>([]);
  const [columns, setColumns] = React.useState<string[]>([]);
  const [editableFields, setEditableFields] = React.useState<Set<string>>(() => new Set());
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(250);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [searchDraft, setSearchDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [cleaningTitles, setCleaningTitles] = React.useState(false);
  const [cleaningItems, setCleaningItems] = React.useState<Set<string>>(() => new Set());
  const [titleCleaningJob, setTitleCleaningJob] = React.useState<TitleCleaningJob | null>(null);
  const [titleCleaningItems, setTitleCleaningItems] = React.useState<Map<string, TitleCleaningQueueItem>>(
    () => new Map()
  );
  const [selectedItemIds, setSelectedItemIds] = React.useState<Set<string>>(() => new Set());
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [editingCell, setEditingCell] = React.useState<EditingCell | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (authLoading || profileLoading) return;

    if (!user || !profile) {
      router.replace("/marketplace");
      return;
    }

    const authorized = profile.account_type === "bicycle_store" && profile.bicycle_store === true;
    if (!authorized) {
      router.replace("/marketplace/settings");
      return;
    }

    setIsAuthorized(true);
  }, [authLoading, profile, profileLoading, router, user]);

  const fetchInventory = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set("search", search);

      const response = await fetch(`/api/lightspeed/inventory-grid?${params.toString()}`);
      const data = (await response.json()) as InventoryResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Failed to load inventory");
      }

      const payload = data as InventoryResponse;
      setRows(payload.rows || []);
      setColumns(payload.columns || []);
      setEditableFields(new Set(payload.editableFields || []));
      setTotal(payload.pagination?.total || 0);
      setTotalPages(payload.pagination?.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  React.useEffect(() => {
    if (isAuthorized !== true) return;
    fetchInventory();
  }, [fetchInventory, isAuthorized]);

  const visibleItemIds = React.useMemo(
    () => rows.map((row) => row.lightspeed_item_id).filter((itemId): itemId is string => Boolean(itemId)),
    [rows]
  );

  const allVisibleSelected =
    visibleItemIds.length > 0 && visibleItemIds.every((itemId) => selectedItemIds.has(itemId));
  const someVisibleSelected = visibleItemIds.some((itemId) => selectedItemIds.has(itemId));

  const toggleVisibleSelection = () => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected || someVisibleSelected) {
        visibleItemIds.forEach((itemId) => next.delete(itemId));
      } else {
        visibleItemIds.forEach((itemId) => next.add(itemId));
      }
      return next;
    });
  };

  const toggleRowSelection = (itemId: string) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const titleCleaningActive = titleCleaningJob
    ? !terminalTitleCleaningStatuses.has(titleCleaningJob.status)
    : false;

  const applyTitleCleaningStatus = React.useCallback(
    (job: TitleCleaningJob | null | undefined, items: TitleCleaningQueueItem[] = []) => {
      setTitleCleaningJob(job || null);
      setTitleCleaningItems(new Map(items.map((item) => [item.lightspeed_item_id, item])));

      const activeItemIds = new Set<string>();
      const completedTitles = new Map<string, string>();
      const finishedItemIds = new Set<string>();

      for (const item of items) {
        if (item.status === "pending" || item.status === "processing") {
          activeItemIds.add(item.lightspeed_item_id);
        }

        if (item.status === "completed" && item.cleaned_description) {
          completedTitles.set(item.lightspeed_item_id, item.cleaned_description);
          finishedItemIds.add(item.lightspeed_item_id);
        }

        if (item.status === "failed" || item.status === "cancelled") {
          finishedItemIds.add(item.lightspeed_item_id);
        }
      }

      setCleaningItems(activeItemIds);

      if (completedTitles.size > 0) {
        setRows((current) =>
          current.map((row) => {
            const itemId = row.lightspeed_item_id || "";
            const title = completedTitles.get(itemId);
            return title ? { ...row, description: title } : row;
          })
        );
      }

      if (finishedItemIds.size > 0) {
        setSelectedItemIds((current) => {
          const next = new Set(current);
          finishedItemIds.forEach((itemId) => next.delete(itemId));
          return next;
        });
      }
    },
    []
  );

  const loadTitleCleaningStatus = React.useCallback(
    async (jobId?: string) => {
      const params = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/lightspeed/inventory-grid/clean-titles${params}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as TitleCleaningStatusResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Failed to load title cleaning status");
      }

      const job = data.job || data.activeJob || null;
      applyTitleCleaningStatus(job, data.items || []);
      return job;
    },
    [applyTitleCleaningStatus]
  );

  React.useEffect(() => {
    if (isAuthorized !== true) return;
    void loadTitleCleaningStatus().catch(() => {
      // Status is opportunistic; the inventory grid can still load without it.
    });
  }, [isAuthorized, loadTitleCleaningStatus]);

  React.useEffect(() => {
    if (!titleCleaningJob || terminalTitleCleaningStatuses.has(titleCleaningJob.status)) return;

    const interval = window.setInterval(() => {
      void loadTitleCleaningStatus(titleCleaningJob.id).catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to refresh title cleaning status");
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadTitleCleaningStatus, titleCleaningJob]);

  const startEdit = (row: InventoryRow, field: string) => {
    if (!row.lightspeed_item_id) return;

    if (!editableFields.has(field)) {
      setMessage(`"${field}" is read-only in this grid.`);
      window.setTimeout(() => setMessage(null), 2500);
      return;
    }

    setMessage(null);
    setError(null);
    setEditingCell({ itemId: row.lightspeed_item_id, field });
    setEditValue(formatCellValue(row[field]));
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingCell) return;

    const key = `${editingCell.itemId}:${editingCell.field}`;
    setSavingKey(key);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/lightspeed/inventory-grid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editingCell.itemId,
          field: editingCell.field,
          value: editValue,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save cell");
      }

      setRows((current) =>
        current.map((row) =>
          row.lightspeed_item_id === editingCell.itemId
            ? { ...row, [editingCell.field]: data.value }
            : row
        )
      );
      setEditingCell(null);
      setEditValue("");
      setMessage(`Saved ${editingCell.field} to Lightspeed.`);
      window.setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cell");
    } finally {
      setSavingKey(null);
    }
  };

  const refreshFromLightspeed = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/lightspeed/sync-all-products", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to refresh Lightspeed inventory");
      }

      setMessage("Lightspeed inventory refreshed.");
      await fetchInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh Lightspeed inventory");
    } finally {
      setSyncing(false);
    }
  };

  const cleanSelectedTitles = async () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length === 0 || cleaningTitles) return;

    setCleaningTitles(true);
    setCleaningItems(new Set(itemIds));
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/lightspeed/inventory-grid/clean-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      const data = (await response.json()) as TitleCleaningStartResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to queue title cleaning");
      }

      applyTitleCleaningStatus(data.job, data.items || []);
      const queuedCount = data.queued || itemIds.length;
      setMessage(`${queuedCount} title${queuedCount === 1 ? "" : "s"} queued for AI cleaning.`);
      window.setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setCleaningItems(new Set());
      setError(err instanceof Error ? err.message : "Failed to queue selected titles");
    } finally {
      setCleaningTitles(false);
    }
  };

  const applySearch = () => {
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const titleCleaningCompletedCount = titleCleaningJob?.completed_count || 0;
  const titleCleaningFailedCount = titleCleaningJob?.failed_count || 0;
  const titleCleaningTotalCount = titleCleaningJob?.total_items || 0;

  if (authLoading || profileLoading || isAuthorized === null) {
    return (
      <>
        <Header title="Data" description="Lightspeed inventory grid" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col overflow-hidden">
      <Header title="Data" description="Lightspeed inventory grid" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Database className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    Full Lightspeed inventory
                  </h2>
                  <Badge variant="outline" className="rounded-md">
                    {total.toLocaleString()} rows
                  </Badge>
                  <Badge variant="secondary" className="rounded-md">
                    Double-click editable cells
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Editable: description, model_year, upc, category_id, manufacturer_id, default_cost.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:w-[320px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applySearch();
                  }}
                  placeholder="Search inventory"
                  className="h-9 rounded-md pl-9 pr-8"
                />
                {searchDraft && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSearchDraft("");
                      setSearch("");
                      setPage(1);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={applySearch}>
                Search
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshFromLightspeed}
                disabled={syncing || loading}
              >
                {syncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                Refresh from Lightspeed
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={cleanSelectedTitles}
                disabled={cleaningTitles || selectedItemIds.size === 0}
              >
                {cleaningTitles ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Clean selected titles
              </Button>
            </div>
          </div>

          {(error || message) && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              {error ? (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive">{error}</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span className="text-muted-foreground">{message}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-30 w-12 min-w-12 border-b border-r bg-muted/50 px-3 py-2">
                  <Checkbox
                    aria-label="Select visible inventory rows for title cleaning"
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    disabled={visibleItemIds.length === 0 || cleaningTitles}
                    onCheckedChange={toggleVisibleSelection}
                  />
                </TableHead>
                {columns.map((column) => {
                  const isEditable = editableFields.has(column);

                  return (
                    <TableHead
                      key={column}
                      className={cn(
                        "border-b border-r bg-muted/50 px-3 py-2 text-xs font-semibold",
                        getColumnWidth(column),
                        isEditable && "text-foreground"
                      )}
                      title={isEditable ? "Double-click to edit" : "Read-only"}
                    >
                      <div className="flex items-center gap-2">
                        <span>{columnLabels[column] || column}</span>
                        {isEditable && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={Math.max(columns.length + 1, 1)} className="h-40 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(columns.length + 1, 1)}
                    className="h-40 text-center text-sm text-muted-foreground"
                  >
                    No cached Lightspeed inventory found. Use Refresh from Lightspeed.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const itemId = row.lightspeed_item_id || "";
                  const isSelected = itemId ? selectedItemIds.has(itemId) : false;
                  const titleCleaningStatus = itemId ? titleCleaningItems.get(itemId) : undefined;

                  return (
                    <TableRow key={String(row.id || row.lightspeed_item_id)} className="hover:bg-muted/40">
                      <TableCell
                        className="sticky left-0 z-10 w-12 min-w-12 border-b border-r bg-background px-3 py-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          aria-label="Select product for title cleaning"
                          checked={isSelected}
                          disabled={!itemId || cleaningItems.has(itemId)}
                          onCheckedChange={() => {
                            if (itemId) toggleRowSelection(itemId);
                          }}
                        />
                      </TableCell>
                      {columns.map((column) => {
                        const isEditing =
                          editingCell?.itemId === itemId && editingCell.field === column;
                        const saveKey = `${itemId}:${column}`;
                        const isQueuedTitle =
                          titleCleaningStatus?.status === "pending" ||
                          titleCleaningStatus?.status === "processing";
                        const isCleaningTitle = column === "description" && isQueuedTitle;
                        const isSaving = savingKey === saveKey || isCleaningTitle;
                        const isEditable = editableFields.has(column);
                        const cellValue = formatCellValue(row[column]);
                        const cellTitle =
                          column === "description" && titleCleaningStatus?.error_message
                            ? titleCleaningStatus.error_message
                            : cellValue;

                        return (
                          <TableCell
                            key={`${itemId}-${column}`}
                            className={cn(
                              "relative border-b border-r px-3 py-2 text-xs align-top",
                              getColumnWidth(column),
                              isSaving && "pr-8",
                              isEditable && "cursor-cell bg-primary/5"
                            )}
                            onDoubleClick={() => {
                              if (!isCleaningTitle) startEdit(row, column);
                            }}
                          >
                            {isEditing ? (
                              <Input
                                autoFocus
                                value={editValue}
                                disabled={isSaving}
                                onChange={(event) => setEditValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") saveEdit();
                                  if (event.key === "Escape") cancelEdit();
                                }}
                                onBlur={saveEdit}
                                className="h-8 min-w-[180px] rounded-md bg-background text-xs"
                              />
                            ) : (
                              <div
                                className={cn(
                                  "line-clamp-3 whitespace-normal break-words",
                                  !cellValue && "text-muted-foreground"
                                )}
                                title={cellTitle}
                              >
                                {cellValue || "NULL"}
                              </div>
                            )}
                            {isSaving && (
                              <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            Page {page} of {totalPages || 1} - showing {rows.length.toLocaleString()} rows
            {selectedItemIds.size > 0 ? ` - ${selectedItemIds.size} selected for title cleaning` : ""}
            {titleCleaningJob ? (
              <>
                {" - "}
                Title cleaning {titleCleaningCompletedCount + titleCleaningFailedCount}/
                {titleCleaningTotalCount}
                {titleCleaningActive ? " running" : ` ${titleCleaningJob.status.replaceAll("_", " ")}`}
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 rows</SelectItem>
                <SelectItem value="250">250 rows</SelectItem>
                <SelectItem value="500">500 rows</SelectItem>
                <SelectItem value="1000">1000 rows</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
