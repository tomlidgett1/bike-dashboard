"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { CheckCircle2, Database, Loader2, Play, RefreshCw, RotateCcw, SlidersHorizontal } from "@/components/layout/app-sidebar/dashboard-icons";
import { ConnectLightspeedBento } from "@/components/lightspeed/connect-lightspeed-bento";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import { MetricsHeader } from "@/components/lightspeed/metrics-header";
import { UnifiedCategoryTable } from "@/components/lightspeed/unified-category-table";
import { ProductTableView } from "@/components/lightspeed/product-table-view";
import { SyncProgressModal } from "@/components/lightspeed/sync-progress-modal";
import { DeleteConfirmDialog } from "@/components/lightspeed/delete-confirm-dialog";
import { InventoryLogsView } from "@/components/lightspeed/inventory-logs-view";
import { CategoryAdjustmentsPanel } from "@/components/lightspeed/category-adjustments-panel";

type ViewMode = 'categories' | 'products' | 'logs' | 'category_adjustments';

interface SyncFilters {
  minSoh: string;
  maxSoh: string;
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
}

interface InventoryProduct {
  id: string;
  itemId: string;
  name: string | null;
  sku: string | null;
  modelYear: string | null;
  upc?: string | null;
  categoryId: string | null;
  categoryName?: string;
  manufacturerId?: string | null;
  price: number;
  totalQoh: number;
  totalSellable: number;
  stockData?: unknown;
  isSynced: boolean;
}

interface InventoryCategoryGroup {
  categoryId: string;
  name: string;
  productCount: number;
  syncedCount?: number;
  products: InventoryProduct[];
}

interface Category {
  categoryId: string;
  name: string;
  totalProducts: number;
  syncedProducts: number;
  notSyncedProducts: number;
  products: InventoryProduct[];
  syncStatus: 'not_synced' | 'partial' | 'fully_synced';
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
}

interface InventoryData {
  categories: Category[];
  notSynced: {
    categories: InventoryCategoryGroup[];
    products: InventoryProduct[];
  };
  synced: {
    categories: InventoryCategoryGroup[];
    products: InventoryProduct[];
  };
  totals: {
    totalProducts: number;
    totalStock: number;
    totalSynced: number;
    totalNotSynced: number;
  };
}

interface SyncResult {
  itemsSynced: number;
  itemsWithStock: number;
  totalItems: number;
}

interface SyncSsePayload {
  totalItems?: number;
  totalItemsInCategories?: number;
  itemsSynced?: number;
  itemsWithStock?: number;
  error?: string;
  phase?: string;
  message?: string;
  progress?: number;
  details?: {
    itemsFetched?: number;
    itemsToSync?: number;
    itemsSynced?: number;
  };
}

interface SalesReportBackfillState {
  status: 'idle' | 'running' | 'complete' | 'error';
  oldest_sale_at: string | null;
  next_before: string | null;
  last_synced_at: string | null;
  last_complete_time: string | null;
  sales_processed: number;
  lines_upserted: number;
  pages_fetched: number;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  last_heartbeat_at?: string | null;
}

interface SalesReportBackfillStatus {
  success: boolean;
  state: SalesReportBackfillState | null;
  row_count: number;
  oldest_complete_time: string | null;
  latest_complete_time: string | null;
  chunk?: {
    sales_fetched: number;
    lines_upserted: number;
    pages_fetched: number;
    hit_page_limit: boolean;
    complete: boolean;
  };
  chunks_run?: number;
  locked?: boolean;
  timed_out?: boolean;
  retry_after_ms?: number | null;
  error?: string;
}

interface InventoryMirrorSyncRun {
  id?: string;
  sync_batch_id: string;
  sync_type: string;
  sync_mode?: 'full' | 'incremental';
  status: string;
  incremental_since?: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  total_item_shop_rows: number;
  total_unique_items: number;
  rows_upserted: number;
  rows_created: number;
  rows_changed: number;
  rows_unchanged: number;
  rows_marked_out_of_stock: number;
  stock_changed: number;
  price_changed: number;
  pages_fetched: number;
  hit_page_limit: boolean;
  error_message: string | null;
}

interface InventoryMirrorStatus {
  success: boolean;
  total_rows: number;
  in_stock_rows: number;
  latest_run: InventoryMirrorSyncRun | null;
  error?: string;
}

function formatBackfillDate(value: string | null | undefined): string {
  if (!value) return 'Not synced';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function backfillStatusLabel(state: SalesReportBackfillState | null): string {
  if (!state) return 'Not started';
  if (state.status === 'complete') return 'Complete';
  if (state.status === 'running') return 'Running';
  if (state.status === 'error') return 'Needs attention';
  return 'Idle';
}

const SALES_REPORT_BACKFILL_PAGES_PER_CHUNK = 5;
const SALES_REPORT_BACKFILL_MAX_CHUNKS_PER_REQUEST = 25;
const SALES_REPORT_BACKFILL_REQUEST_TIME_BUDGET_MS = 45_000;
const SALES_REPORT_BACKFILL_CHUNK_DELAY_MS = 500;
const SALES_REPORT_BACKFILL_RETRY_LIMIT = 12;
const SALES_REPORT_BACKFILL_RETRY_BASE_DELAY_MS = 2500;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPermanentBackfillError(message: string): boolean {
  return /unauthori[sz]ed|no valid access token|session expired|please reconnect|not currently connected/i.test(message);
}

export default function ConnectLightspeedPage() {
  const [viewMode, setViewMode] = React.useState<ViewMode>('categories');
  const [inventoryData, setInventoryData] = React.useState<InventoryData | null>(null);
  const [loadingInventory, setLoadingInventory] = React.useState(false);
  const [salesReportStatus, setSalesReportStatus] = React.useState<SalesReportBackfillStatus | null>(null);
  const [loadingSalesReportStatus, setLoadingSalesReportStatus] = React.useState(false);
  const [salesReportBackfillRunning, setSalesReportBackfillRunning] = React.useState(false);
  const [salesReportBackfillMessage, setSalesReportBackfillMessage] = React.useState('');
  const [salesReportBackfillError, setSalesReportBackfillError] = React.useState('');
  const [inventoryMirrorStatus, setInventoryMirrorStatus] = React.useState<InventoryMirrorStatus | null>(null);
  const [loadingInventoryMirrorStatus, setLoadingInventoryMirrorStatus] = React.useState(false);
  const [inventoryMirrorSyncing, setInventoryMirrorSyncing] = React.useState(false);
  const [inventoryMirrorMessage, setInventoryMirrorMessage] = React.useState('');
  const [inventoryMirrorError, setInventoryMirrorError] = React.useState('');
  
  // Synced / Not Synced filter per view
  const [productSyncFilter, setProductSyncFilter] = React.useState<'not_synced' | 'synced'>('not_synced');
  const [categorySyncFilter, setCategorySyncFilter] = React.useState<'not_synced' | 'synced'>('not_synced');

  // Selection state
  const [selectedCategories, setSelectedCategories] = React.useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
  
  // Expanded category
  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(null);
  
  // Sync state
  const [syncModalOpen, setSyncModalOpen] = React.useState(false);
  const [syncStatus, setSyncStatus] = React.useState<'syncing' | 'success' | 'error' | null>(null);
  const [syncProgress, setSyncProgress] = React.useState(0);
  const [syncPhase, setSyncPhase] = React.useState('');
  const [syncMessage, setSyncMessage] = React.useState('');
  const [syncResult, setSyncResult] = React.useState<SyncResult | null>(null);
  const [syncError, setSyncError] = React.useState('');

  // Sync filter state — applied filters vs in-sheet draft
  const emptyFilters: SyncFilters = { minSoh: '', maxSoh: '', minPrice: '', maxPrice: '', inStockOnly: false };
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);
  const [syncFilters, setSyncFilters] = React.useState<SyncFilters>(emptyFilters);
  const [draftFilters, setDraftFilters] = React.useState<SyncFilters>(emptyFilters);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{ type: 'categories' | 'products', ids: string[] } | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const {
    isConnected,
    isLoading,
    isConnecting,
    accountInfo,
    connection,
    error,
    connect,
    disconnect,
  } = useLightspeedConnection({ autoFetch: true });

  const fetchInventoryData = React.useCallback(async () => {
    setLoadingInventory(true);
    try {
      const response = await fetch('/api/lightspeed/inventory-overview');
      const data = await response.json() as InventoryData & { success?: boolean };
      
      if (data.success) {
        setInventoryData(data);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  const loadSalesReportBackfillStatus = React.useCallback(async (): Promise<SalesReportBackfillStatus> => {
    const response = await fetch('/api/lightspeed/sales-report-backfill', { cache: 'no-store' });
    const data = await response.json().catch(() => ({})) as SalesReportBackfillStatus;

    if (!response.ok || data.success === false) {
      throw new Error(data.error || `Sales report status failed (${response.status})`);
    }

    return data;
  }, []);

  const fetchSalesReportBackfillStatus = React.useCallback(async () => {
    setLoadingSalesReportStatus(true);
    try {
      const data = await loadSalesReportBackfillStatus();
      setSalesReportStatus(data);
      setSalesReportBackfillError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load sales report backfill status';
      console.error('[Lightspeed Sales Report] Status error:', error);
      setSalesReportBackfillError(message);
    } finally {
      setLoadingSalesReportStatus(false);
    }
  }, [loadSalesReportBackfillStatus]);

  const fetchInventoryMirrorStatus = React.useCallback(async () => {
    setLoadingInventoryMirrorStatus(true);
    try {
      const response = await fetch('/api/lightspeed/inventory-mirror-sync', { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as InventoryMirrorStatus;

      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Inventory mirror status failed (${response.status})`);
      }

      setInventoryMirrorStatus(data);
      setInventoryMirrorError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load inventory mirror status';
      console.error('[Lightspeed Inventory Mirror] Status error:', error);
      setInventoryMirrorError(message);
    } finally {
      setLoadingInventoryMirrorStatus(false);
    }
  }, []);

  // Fetch inventory data when connected
  React.useEffect(() => {
    if (isConnected) {
      fetchInventoryData();
      fetchSalesReportBackfillStatus();
      fetchInventoryMirrorStatus();
    }
  }, [fetchInventoryData, fetchInventoryMirrorStatus, fetchSalesReportBackfillStatus, isConnected]);

  const runInventoryMirrorSync = async () => {
    if (inventoryMirrorSyncing) return;

    setInventoryMirrorSyncing(true);
    setInventoryMirrorError('');
    setInventoryMirrorMessage('Syncing the Lightspeed inventory table...');

    try {
      const response = await fetch('/api/lightspeed/inventory-mirror-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({})) as {
        success?: boolean;
        result?: InventoryMirrorSyncRun;
        status?: InventoryMirrorStatus;
        error?: string;
      };

      if (!response.ok || data.success === false || !data.result) {
        throw new Error(data.error || `Inventory sync failed (${response.status})`);
      }

      const result = data.result;
      setInventoryMirrorStatus(data.status ?? null);
      const syncVerb = result.sync_mode === 'incremental' ? 'Checked inventory diffs' : 'Synced inventory table';
      setInventoryMirrorMessage(
        `${syncVerb}: ${result.rows_upserted.toLocaleString()} rows processed, ${result.rows_created.toLocaleString()} new, ${result.rows_changed.toLocaleString()} changed, ${result.stock_changed.toLocaleString()} stock diffs, ${result.rows_marked_out_of_stock.toLocaleString()} marked out of stock.`,
      );
      await Promise.all([
        fetchInventoryMirrorStatus(),
        fetchInventoryData(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Inventory table sync failed';
      console.error('[Lightspeed Inventory Mirror] Sync error:', error);
      setInventoryMirrorError(message);
      setInventoryMirrorMessage('');
    } finally {
      setInventoryMirrorSyncing(false);
    }
  };

  const runSalesReportBackfill = async (initialAction: 'start' | 'continue' | 'restart') => {
    if (salesReportBackfillRunning) return;

    setSalesReportBackfillRunning(true);
    setSalesReportBackfillError('');
    setSalesReportBackfillMessage(
      initialAction === 'restart'
        ? 'Restarting full sales backfill...'
        : 'Finding the oldest completed Lightspeed sale...',
    );

    let action: 'start' | 'continue' | 'restart' = initialAction;
    let latestStatus: SalesReportBackfillStatus | null = null;
    let consecutiveFailures = 0;
    let chunksRun = 0;

    try {
      while (true) {
        let data: SalesReportBackfillStatus | null = null;

        try {
          const response = await fetch('/api/lightspeed/sales-report-backfill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              maxPagesPerChunk: SALES_REPORT_BACKFILL_PAGES_PER_CHUNK,
              maxChunks: SALES_REPORT_BACKFILL_MAX_CHUNKS_PER_REQUEST,
              timeBudgetMs: SALES_REPORT_BACKFILL_REQUEST_TIME_BUDGET_MS,
            }),
          });
          data = await response.json().catch(() => ({})) as SalesReportBackfillStatus;

          if (data.state) {
            setSalesReportStatus(data);
            latestStatus = data;
          }

          if (!response.ok || data.success === false) {
            throw new Error(data.state?.last_error || data.error || `Sales report backfill failed (${response.status})`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sales report backfill chunk failed';
          const status = await loadSalesReportBackfillStatus().catch(() => null);

          if (status?.state) {
            setSalesReportStatus(status);
            latestStatus = status;
          }

          if (status?.state?.status === 'complete') {
            data = status;
          } else if (
            !isPermanentBackfillError(message) &&
            consecutiveFailures < SALES_REPORT_BACKFILL_RETRY_LIMIT
          ) {
            consecutiveFailures += 1;
            action = 'continue';
            setSalesReportBackfillError('');
            setSalesReportBackfillMessage(
              `Still running. Retrying from the saved checkpoint (${consecutiveFailures}/${SALES_REPORT_BACKFILL_RETRY_LIMIT})...`,
            );
            await wait(SALES_REPORT_BACKFILL_RETRY_BASE_DELAY_MS * consecutiveFailures);
            continue;
          } else {
            throw error;
          }
        }

        if (!data) {
          throw new Error('Sales report backfill returned no status.');
        }

        consecutiveFailures = 0;
        chunksRun += 1;
        const rows = (data.row_count ?? 0).toLocaleString();
        const chunkLines = data.chunk?.lines_upserted ?? 0;
        const chunkSales = data.chunk?.sales_fetched ?? 0;
        const serverChunks = data.chunks_run ?? 0;
        setSalesReportBackfillMessage(
          data.state?.status === 'complete'
            ? `Complete. ${rows} sale-line rows are stored.`
            : data.locked
              ? `Backfill worker is already running from another request. ${rows} rows are stored; checking the saved checkpoint again shortly.`
              : `Backfilling until complete: ${rows} rows stored, ${chunksRun.toLocaleString()} requests run, ${serverChunks.toLocaleString()} chunks processed in this request, ${chunkSales.toLocaleString()} sales scanned, ${chunkLines.toLocaleString()} rows upserted. You can leave this page; background workers will keep moving until complete.`,
        );

        if (data.state?.status === 'complete' || data.chunk?.complete) {
          latestStatus = data;
          break;
        }

        action = 'continue';
        await wait(data.retry_after_ms ?? SALES_REPORT_BACKFILL_CHUNK_DELAY_MS);
      }

      if (latestStatus?.state?.status !== 'complete') {
        setSalesReportBackfillMessage('Backfill is still running. Background workers will keep processing older sales until complete.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sales report backfill failed';
      console.error('[Lightspeed Sales Report] Backfill error:', error);
      setSalesReportBackfillError(message);
      setSalesReportBackfillMessage('');
    } finally {
      setSalesReportBackfillRunning(false);
      await fetchSalesReportBackfillStatus();
    }
  };

  // Count how many filter fields are active
  const activeFilterCount = [
    syncFilters.inStockOnly,
    syncFilters.minSoh !== '' && !syncFilters.inStockOnly,
    syncFilters.maxSoh !== '',
    syncFilters.minPrice !== '',
    syncFilters.maxPrice !== '',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setDraftFilters(emptyFilters);
  };

  const openFilterSheet = () => {
    setDraftFilters(syncFilters); // seed draft from currently applied filters
    setFilterSheetOpen(true);
  };

  const applyFilters = () => {
    setSyncFilters(draftFilters);
    setFilterSheetOpen(false);
  };

  // Returns true if the product passes the active sync filters
  const productPassesFilters = (product: InventoryProduct): boolean => {
    const minSoh = syncFilters.inStockOnly ? 1 : (syncFilters.minSoh !== '' ? parseFloat(syncFilters.minSoh) : null);
    const maxSoh = syncFilters.maxSoh !== '' ? parseFloat(syncFilters.maxSoh) : null;
    const minPrice = syncFilters.minPrice !== '' ? parseFloat(syncFilters.minPrice) : null;
    const maxPrice = syncFilters.maxPrice !== '' ? parseFloat(syncFilters.maxPrice) : null;

    if (minSoh !== null && (product.totalQoh ?? 0) < minSoh) return false;
    if (maxSoh !== null && (product.totalQoh ?? 0) > maxSoh) return false;
    if (minPrice !== null && (product.price ?? 0) < minPrice) return false;
    if (maxPrice !== null && (product.price ?? 0) > maxPrice) return false;

    return true;
  };

  // Preview: count of not-synced products that pass the *draft* filters (shown live in the sheet)
  const draftFilterCount = [
    draftFilters.inStockOnly,
    draftFilters.minSoh !== '' && !draftFilters.inStockOnly,
    draftFilters.maxSoh !== '',
    draftFilters.minPrice !== '',
    draftFilters.maxPrice !== '',
  ].filter(Boolean).length;

  const filteredNotSyncedCount = React.useMemo(() => {
    if (!inventoryData || draftFilterCount === 0) return null;
    const allNotSynced = inventoryData.categories.flatMap(cat =>
      cat.notSyncedProducts > 0 ? cat.products : []
    );
    const passesDraft = (product: InventoryProduct): boolean => {
      const minSoh = draftFilters.inStockOnly ? 1 : (draftFilters.minSoh !== '' ? parseFloat(draftFilters.minSoh) : null);
      const maxSoh = draftFilters.maxSoh !== '' ? parseFloat(draftFilters.maxSoh) : null;
      const minPrice = draftFilters.minPrice !== '' ? parseFloat(draftFilters.minPrice) : null;
      const maxPrice = draftFilters.maxPrice !== '' ? parseFloat(draftFilters.maxPrice) : null;
      if (minSoh !== null && (product.totalQoh ?? 0) < minSoh) return false;
      if (maxSoh !== null && (product.totalQoh ?? 0) > maxSoh) return false;
      if (minPrice !== null && (product.price ?? 0) < minPrice) return false;
      if (maxPrice !== null && (product.price ?? 0) > maxPrice) return false;
      return true;
    };
    return { passing: allNotSynced.filter(passesDraft).length, total: allNotSynced.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryData, draftFilters]);

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const runSseSync = async (requestBody: { categoryIds?: string[]; itemIds?: string[] }) => {
    setSyncModalOpen(true);
    setSyncStatus('syncing');
    setSyncProgress(0);
    setSyncPhase('Initializing sync...');
    setSyncMessage('Preparing to sync your inventory');
    setSyncError('');

    try {
      // Route through Next.js proxy to avoid Supabase gateway SSE buffering.
      // Auth is handled server-side; no client-side token needed.
      const response = await fetch('/api/lightspeed/sync-sse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(`Sync request failed: ${response.status}`);
      if (!response.body) throw new Error('No response body for SSE');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const eventMatch = line.match(/^event: (.+)$/m);
          const dataMatch = line.match(/^data: (.+)$/m);
          if (!dataMatch) continue;

          try {
            const data = JSON.parse(dataMatch[1]) as SyncSsePayload;
            if (eventMatch?.[1] === 'complete') {
              setSyncProgress(100);
              setSyncStatus('success');
              // Normalise field name — edge function returns totalItemsInCategories,
              // but SyncProgressModal expects totalItems.
              setSyncResult({
                itemsSynced: data.itemsSynced ?? 0,
                itemsWithStock: data.itemsWithStock ?? 0,
                totalItems: data.totalItems ?? data.totalItemsInCategories ?? 0,
              });
              setSelectedCategories(new Set());
              setSelectedProducts(new Set());
              await fetchInventoryData();
            } else if (eventMatch?.[1] === 'error') {
              setSyncStatus('error');
              setSyncError(data.error || 'Sync failed');
            } else {
              if (data.phase) setSyncPhase(data.phase.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()));
              if (data.message) setSyncMessage(data.message);
              if (typeof data.progress === 'number') setSyncProgress(Math.min(data.progress, 99));
              if (data.details) {
                const d = data.details;
                let detailText = data.message ?? '';
                if (d.itemsFetched) detailText += ` • ${d.itemsFetched} items fetched`;
                if (d.itemsToSync) detailText += ` • ${d.itemsToSync} to sync`;
                if (d.itemsSynced) detailText += ` • ${d.itemsSynced} synced`;
                setSyncMessage(detailText);
              }
            }
          } catch {
            console.error('[Sync SSE] Parse error');
          }
        }
      }
    } catch (error) {
      console.error('[Sync] Error:', error);
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleSyncSelected = async () => {
    const categoriesToSync = Array.from(selectedCategories).filter(catId => {
      const category = inventoryData?.categories.find(c => c.categoryId === catId);
      return category && category.notSyncedProducts > 0;
    });
    if (categoriesToSync.length === 0) return;

    if (activeFilterCount > 0) {
      const productsInSelection = categoriesToSync.flatMap(catId => {
        const cat = inventoryData?.categories.find(c => c.categoryId === catId);
        return (cat?.products ?? []).filter((p) => !p.isSynced);
      });
      const filteredItemIds = productsInSelection.filter(productPassesFilters).map((p) => p.itemId);
      if (filteredItemIds.length === 0) return;
      await runSseSync({ itemIds: filteredItemIds });
    } else {
      await runSseSync({ categoryIds: categoriesToSync });
    }
  };

  const handleSyncSelectedProducts = async () => {
    if (selectedProducts.size === 0) return;
    await runSseSync({ itemIds: Array.from(selectedProducts) });
  };

  const handleRemoveSelected = () => {
    // Get categories that are synced
    const categoriesToRemove = Array.from(selectedCategories).filter(catId => {
      const category = inventoryData?.categories.find(c => c.categoryId === catId);
      return category && category.syncedProducts > 0;
    });

    if (categoriesToRemove.length === 0) {
      return;
    }

    setDeleteTarget({ type: 'categories', ids: categoriesToRemove });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const body: { categoryIds?: string[]; productIds?: string[] } = {};
      
      if (deleteTarget.type === 'categories') {
        body.categoryIds = deleteTarget.ids;
      } else {
        body.productIds = deleteTarget.ids;
      }

      const response = await fetch('/api/products/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Delete failed (${response.status})`);
      }

      await fetchInventoryData();
      setSelectedCategories(new Set());
      setSelectedProducts(new Set());
      setDeleteDialogOpen(false);
      setDeleteTarget(null);

    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleProductToggle = (itemId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Clear selection when the sync filter changes so stale IDs don't carry over
  React.useEffect(() => { setSelectedProducts(new Set()); }, [productSyncFilter]);
  React.useEffect(() => { setSelectedCategories(new Set()); }, [categorySyncFilter]);

  const handleSelectAllProducts = () => {
    const source = productSyncFilter === 'synced'
      ? inventoryData?.synced.products
      : inventoryData?.notSynced.products;
    setSelectedProducts(new Set((source || []).map((p) => p.itemId)));
  };

  const handleClearAllProducts = () => {
    setSelectedProducts(new Set());
  };

  const handleDeleteProducts = (itemIds: string[]) => {
    setDeleteTarget({ type: 'products', ids: itemIds });
    setDeleteDialogOpen(true);
  };

  // Get selected counts for actions
  const selectedWithProducts = Array.from(selectedCategories)
    .map(catId => inventoryData?.categories.find(c => c.categoryId === catId))
    .filter(Boolean);
  
  const hasNotSyncedSelected = selectedWithProducts.some(cat => cat && cat.notSyncedProducts > 0);
  const hasSyncedSelected = selectedWithProducts.some(cat => cat && cat.syncedProducts > 0);
  const inventoryMirrorRun = inventoryMirrorStatus?.latest_run ?? null;
  const inventoryMirrorErrorText = inventoryMirrorError || inventoryMirrorRun?.error_message || '';
  const salesReportState = salesReportStatus?.state ?? null;
  const salesReportPrimaryAction: 'start' | 'continue' | 'restart' =
    salesReportState?.status === 'complete'
      ? 'restart'
      : salesReportState
        ? 'continue'
        : 'start';
  const salesReportPrimaryLabel =
    salesReportState?.status === 'complete'
      ? 'Re-run full backfill'
      : salesReportState?.status === 'running'
        ? 'Continue backfill'
        : salesReportState?.status === 'error'
          ? 'Retry backfill'
          : 'Run sales backfill';
  const salesReportError = salesReportBackfillError || salesReportState?.last_error || '';

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  // Not connected state
  if (!isConnected) {
    return (
      <ConnectLightspeedBento
        error={error}
        isConnecting={isConnecting}
        onConnect={connect}
      />
    );
  }

  return (
    <>
      {/* Metrics Header */}
      <MetricsHeader
        accountName={accountInfo?.name || 'Lightspeed Account'}
        accountId={connection?.account_id || 'N/A'}
        totalProducts={inventoryData?.totals.totalProducts || 0}
        totalStock={inventoryData?.totals.totalStock || 0}
        totalSynced={inventoryData?.totals.totalSynced || 0}
        totalNotSynced={inventoryData?.totals.totalNotSynced || 0}
        lastSyncTime={connection?.last_sync_at ? new Date(connection.last_sync_at) : null}
        isRefreshing={loadingInventory}
        onRefresh={fetchInventoryData}
        onDisconnect={disconnect}
      />

      <div className="space-y-3 border-b border-border bg-background px-6 py-3">
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Database className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">Inventory table</h2>
                  <Badge
                    variant={inventoryMirrorRun?.status === 'completed' ? 'default' : 'secondary'}
                    className="rounded-md"
                  >
                    {inventoryMirrorRun?.status === 'completed' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                    {inventoryMirrorRun?.status ? inventoryMirrorRun.status.replace(/_/g, ' ') : 'Not synced'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Rows:{' '}
                    <span className="font-medium text-foreground">
                      {(inventoryMirrorStatus?.total_rows ?? 0).toLocaleString()}
                    </span>
                  </span>
                  <span>
                    In stock:{' '}
                    <span className="font-medium text-foreground">
                      {(inventoryMirrorStatus?.in_stock_rows ?? 0).toLocaleString()}
                    </span>
                  </span>
                  <span>
                    Last sync:{' '}
                    <span className="font-medium text-foreground">
                      {formatBackfillDate(inventoryMirrorRun?.completed_at || inventoryMirrorRun?.started_at)}
                    </span>
                  </span>
                  <span>
                    Last diffs:{' '}
                    <span className="font-medium text-foreground">
                      {inventoryMirrorRun
                        ? `${inventoryMirrorRun.rows_changed.toLocaleString()} changed, ${inventoryMirrorRun.stock_changed.toLocaleString()} stock, ${inventoryMirrorRun.price_changed.toLocaleString()} price`
                        : 'None yet'}
                    </span>
                  </span>
                  <span>
                    Background:{' '}
                    <span className="font-medium text-foreground">every 10 min</span>
                  </span>
                </div>
                {(inventoryMirrorMessage || inventoryMirrorErrorText) && (
                  <p className={cn(
                    "text-xs",
                    inventoryMirrorErrorText ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                  )}>
                    {inventoryMirrorErrorText || inventoryMirrorMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="rounded-md"
                onClick={runInventoryMirrorSync}
                disabled={inventoryMirrorSyncing || loadingInventoryMirrorStatus}
              >
                {inventoryMirrorSyncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {inventoryMirrorSyncing ? 'Syncing...' : 'Sync inventory table'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-md"
                onClick={fetchInventoryMirrorStatus}
                disabled={inventoryMirrorSyncing || loadingInventoryMirrorStatus}
              >
                {loadingInventoryMirrorStatus ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Database className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">Sales report data</h2>
                  <Badge
                    variant={salesReportState?.status === 'complete' ? 'default' : 'secondary'}
                    className="rounded-md"
                  >
                    {salesReportState?.status === 'complete' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                    {backfillStatusLabel(salesReportState)}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Rows:{' '}
                    <span className="font-medium text-foreground">
                      {(salesReportStatus?.row_count ?? 0).toLocaleString()}
                    </span>
                  </span>
                  <span>
                    Oldest stored:{' '}
                    <span className="font-medium text-foreground">
                      {formatBackfillDate(salesReportStatus?.oldest_complete_time)}
                    </span>
                  </span>
                  <span>
                    Latest stored:{' '}
                    <span className="font-medium text-foreground">
                      {formatBackfillDate(salesReportStatus?.latest_complete_time)}
                    </span>
                  </span>
                  <span>
                    Oldest Lightspeed sale:{' '}
                    <span className="font-medium text-foreground">
                      {formatBackfillDate(salesReportState?.oldest_sale_at)}
                    </span>
                  </span>
                  <span>
                    Background:{' '}
                    <span className="font-medium text-foreground">
                      backfill every minute, recent sales every 10 min
                    </span>
                  </span>
                </div>
                {(salesReportBackfillMessage || salesReportError) && (
                  <p className={cn(
                    "text-xs",
                    salesReportError ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                  )}>
                    {salesReportError || salesReportBackfillMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="rounded-md"
                onClick={() => runSalesReportBackfill(salesReportPrimaryAction)}
                disabled={salesReportBackfillRunning || loadingSalesReportStatus}
              >
                {salesReportBackfillRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {salesReportBackfillRunning ? 'Backfilling...' : salesReportPrimaryLabel}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-md"
                onClick={fetchSalesReportBackfillStatus}
                disabled={salesReportBackfillRunning || loadingSalesReportStatus}
              >
                {loadingSalesReportStatus ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full width container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loadingInventory ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Tabs and Actions Bar - with horizontal padding only */}
            <div className="px-6 py-4 bg-white dark:bg-card border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between gap-3">
                {/* Left: view tabs + synced/not-synced toggle */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* View Mode Tabs */}
                  <div className="flex items-center bg-muted p-0.5 rounded-md w-fit">
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        viewMode === 'categories'
                          ? "text-foreground bg-background shadow-xs ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted/70"
                      )}
                      onClick={() => setViewMode('categories')}
                    >
                      By Categories
                      {selectedCategories.size > 0 && (
                        <Badge variant="secondary" className="rounded-md ml-1 h-5 px-1.5 text-xs">
                          {selectedCategories.size}
                        </Badge>
                      )}
                    </button>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        viewMode === 'products'
                          ? "text-foreground bg-background shadow-xs ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted/70"
                      )}
                      onClick={() => setViewMode('products')}
                    >
                      All Products
                      {selectedProducts.size > 0 && (
                        <Badge variant="secondary" className="rounded-md ml-1 h-5 px-1.5 text-xs">
                          {selectedProducts.size}
                        </Badge>
                      )}
                    </button>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        viewMode === 'logs'
                          ? "text-foreground bg-background shadow-xs ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted/70"
                      )}
                      onClick={() => setViewMode('logs')}
                    >
                      Logs
                    </button>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        viewMode === 'category_adjustments'
                          ? "text-foreground bg-background shadow-xs ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted/70"
                      )}
                      onClick={() => setViewMode('category_adjustments')}
                    >
                      Adjust categories
                    </button>
                  </div>

                  {/* Synced / Not Synced toggle — only for categories and products views */}
                  {(viewMode === 'categories' || viewMode === 'products') && (
                    <div className="flex items-center bg-muted p-0.5 rounded-md">
                      <button
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                          (viewMode === 'products' ? productSyncFilter : categorySyncFilter) === 'not_synced'
                            ? "text-foreground bg-background shadow-xs ring-1 ring-border"
                            : "text-muted-foreground hover:bg-muted/70"
                        )}
                        onClick={() =>
                          viewMode === 'products'
                            ? setProductSyncFilter('not_synced')
                            : setCategorySyncFilter('not_synced')
                        }
                      >
                        Not Synced
                      </button>
                      <button
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                          (viewMode === 'products' ? productSyncFilter : categorySyncFilter) === 'synced'
                            ? "text-foreground bg-background shadow-xs ring-1 ring-border"
                            : "text-muted-foreground hover:bg-muted/70"
                        )}
                        onClick={() =>
                          viewMode === 'products'
                            ? setProductSyncFilter('synced')
                            : setCategorySyncFilter('synced')
                        }
                      >
                        Synced
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: Action Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Filters button — visible in categories and products views */}
                  {(viewMode === 'categories' || viewMode === 'products') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="relative"
                      onClick={openFilterSheet}
                    >
                      <SlidersHorizontal className="size-4" />
                      {viewMode === 'products' ? 'Filters' : 'Sync Filters'}
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  )}

                  {viewMode === 'categories' && selectedCategories.size > 0 && (
                    <>
                      {hasNotSyncedSelected && (
                        <Button
                          onClick={handleSyncSelected}
                          size="sm"
                        >
                          Sync to Marketplace
                        </Button>
                      )}
                      {hasSyncedSelected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveSelected}
                        >
                          Remove from Marketplace
                        </Button>
                      )}
                    </>
                  )}

                  {viewMode === 'products' && selectedProducts.size > 0 && (
                    productSyncFilter === 'synced' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteProducts(Array.from(selectedProducts))}
                      >
                        Remove {selectedProducts.size} from Marketplace
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSyncSelectedProducts}
                        size="sm"
                      >
                        Sync {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} to Marketplace
                      </Button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Table Container - Full width, scrollable */}
            <div className="flex-1 overflow-auto bg-background">
              {viewMode === 'categories' ? (
                <UnifiedCategoryTable
                  categories={inventoryData?.categories || []}
                  selectedCategories={selectedCategories}
                  onCategoryToggle={handleCategoryToggle}
                  expandedCategory={expandedCategory}
                  onCategoryExpand={setExpandedCategory}
                  syncFilter={categorySyncFilter}
                />
              ) : viewMode === 'products' ? (
                <ProductTableView
                  products={
                    (productSyncFilter === 'synced'
                      ? (inventoryData?.synced.products ?? [])
                      : (inventoryData?.notSynced.products ?? [])
                    ).map((p) => ({
	                      id: p.id,
	                      itemId: p.itemId,
	                      name: p.name ?? 'Unnamed product',
	                      sku: p.sku ?? '',
	                      modelYear: p.modelYear ?? '',
	                      categoryId: p.categoryId ?? '',
	                      price: p.price ?? 0,
	                      totalQoh: p.totalQoh ?? 0,
	                      totalSellable: p.totalSellable ?? 0,
	                      isSynced: productSyncFilter === 'synced',
                    }))
                  }
                  selectedProducts={selectedProducts}
                  onProductToggle={handleProductToggle}
                  onSelectAll={handleSelectAllProducts}
                  onClearAll={handleClearAllProducts}
                  onDeleteProducts={handleDeleteProducts}
                  syncFilters={syncFilters}
                  activeFilterCount={activeFilterCount}
                  onOpenFilters={openFilterSheet}
                />
              ) : viewMode === 'category_adjustments' ? (
                <CategoryAdjustmentsPanel onCategoriesChanged={fetchInventoryData} />
              ) : (
                <InventoryLogsView />
              )}
            </div>
          </>
        )}
      </div>

      {/* Sync Progress Modal */}
      <SyncProgressModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        status={syncStatus}
        progress={syncProgress}
        phase={syncPhase}
        message={syncMessage}
        result={syncResult ?? undefined}
        error={syncError}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        itemCount={deleteTarget?.ids.length || 0}
        itemType={deleteTarget?.type || 'products'}
      />

      {/* Sync Filters Sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-5 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">Sync Filters</SheetTitle>
              {draftFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset all
                </button>
              )}
            </div>
            <SheetDescription>
              Filter which products are shown in All Products and included when syncing to the marketplace.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Stock on Hand */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Stock on Hand (SOH)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filter by quantity currently in stock across all locations.
                </p>
              </div>

              {/* In stock only toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">In stock only</Label>
                  <p className="text-xs text-muted-foreground">Exclude products with zero stock (SOH ≥ 1)</p>
                </div>
                <Switch
                  checked={draftFilters.inStockOnly}
                  onCheckedChange={(checked) =>
                    setDraftFilters(prev => ({ ...prev, inStockOnly: checked, minSoh: checked ? '' : prev.minSoh }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="minSoh" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Min SOH
                  </Label>
                  <Input
                    id="minSoh"
                    type="number"
                    min={0}
                    placeholder="e.g. 1"
                    value={draftFilters.inStockOnly ? '1' : draftFilters.minSoh}
                    disabled={draftFilters.inStockOnly}
                    onChange={(e) => setDraftFilters(prev => ({ ...prev, minSoh: e.target.value }))}
                    className="rounded-md h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maxSoh" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Max SOH
                  </Label>
                  <Input
                    id="maxSoh"
                    type="number"
                    min={0}
                    placeholder="No limit"
                    value={draftFilters.maxSoh}
                    onChange={(e) => setDraftFilters(prev => ({ ...prev, maxSoh: e.target.value }))}
                    className="rounded-md h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Price Range */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Price Range</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filter by the product sell price from Lightspeed.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="minPrice" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Min Price
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="minPrice"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={draftFilters.minPrice}
                      onChange={(e) => setDraftFilters(prev => ({ ...prev, minPrice: e.target.value }))}
                      className="rounded-md h-9 text-sm pl-7"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maxPrice" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Max Price
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="maxPrice"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="No limit"
                      value={draftFilters.maxPrice}
                      onChange={(e) => setDraftFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
                      className="rounded-md h-9 text-sm pl-7"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Live preview */}
            {filteredNotSyncedCount !== null && (
              <>
                <Separator />
                <div className="rounded-md bg-secondary/60 px-4 py-3 space-y-1">
                  <p className="text-sm font-medium">Filter Preview</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{filteredNotSyncedCount.passing.toLocaleString()}</span>
                    {' '}of{' '}
                    <span className="font-semibold text-foreground">{filteredNotSyncedCount.total.toLocaleString()}</span>
                    {' '}unsynced products match these filters.
                  </p>
                </div>
              </>
            )}
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border flex flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-md"
              onClick={() => setFilterSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-md"
              onClick={applyFilters}
            >
              {draftFilterCount > 0 ? `Apply ${draftFilterCount} filter${draftFilterCount > 1 ? 's' : ''}` : 'Apply'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
