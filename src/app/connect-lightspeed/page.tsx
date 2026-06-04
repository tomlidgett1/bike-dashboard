"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, AlertCircle, SlidersHorizontal, X, RotateCcw } from "lucide-react";
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

type ViewMode = 'categories' | 'products' | 'logs';

interface SyncFilters {
  minSoh: string;
  maxSoh: string;
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
}

interface Category {
  categoryId: string;
  name: string;
  totalProducts: number;
  syncedProducts: number;
  notSyncedProducts: number;
  products: any[];
  syncStatus: 'not_synced' | 'partial' | 'fully_synced';
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
}

interface InventoryData {
  categories: Category[];
  notSynced: {
    categories: any[];
    products: any[];
  };
  synced: {
    categories: any[];
    products: any[];
  };
  totals: {
    totalProducts: number;
    totalStock: number;
    totalSynced: number;
    totalNotSynced: number;
  };
}

export default function ConnectLightspeedPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<ViewMode>('categories');
  const [inventoryData, setInventoryData] = React.useState<InventoryData | null>(null);
  const [loadingInventory, setLoadingInventory] = React.useState(false);
  
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
  const [syncResult, setSyncResult] = React.useState<any>(null);
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

  // Fetch inventory data when connected
  React.useEffect(() => {
    if (isConnected) {
      fetchInventoryData();
    }
  }, [isConnected]);

  const fetchInventoryData = async () => {
    setLoadingInventory(true);
    try {
      const response = await fetch('/api/lightspeed/inventory-overview');
      const data = await response.json();
      
      if (data.success) {
        setInventoryData(data);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoadingInventory(false);
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
  const productPassesFilters = (product: any): boolean => {
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
    const passesDraft = (product: any): boolean => {
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
            const data = JSON.parse(dataMatch[1]);
            if (eventMatch?.[1] === 'complete') {
              setSyncProgress(100);
              setSyncStatus('success');
              // Normalise field name — edge function returns totalItemsInCategories,
              // but SyncProgressModal expects totalItems.
              setSyncResult({
                ...data,
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
                let detailText = data.message;
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
        return (cat?.products ?? []).filter((p: any) => !p.isSynced);
      });
      const filteredItemIds = productsInSelection.filter(productPassesFilters).map((p: any) => p.itemId);
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
      const body: any = {};
      
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
    setSelectedProducts(new Set((source || []).map((p: any) => p.itemId)));
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
      <div className="flex items-center justify-center min-h-[70vh] p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-md bg-secondary flex items-center justify-center">
              <Zap className="h-8 w-8 text-foreground" />
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl font-semibold mb-2">Connect to Lightspeed</h2>
            <p className="text-muted-foreground">
              Connect your Lightspeed POS account to sync your inventory to the marketplace
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-900 dark:text-red-400">
                  {error}
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={connect}
            disabled={isConnecting}
            size="lg"
            className="w-full rounded-md"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-5 w-5" />
                Connect Lightspeed
              </>
            )}
          </Button>
        </div>
      </div>
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
                      className="rounded-md relative"
                      onClick={openFilterSheet}
                    >
                      <SlidersHorizontal className="h-4 w-4 mr-1.5" />
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
                          className="rounded-md"
                        >
                          Sync to Marketplace
                        </Button>
                      )}
                      {hasSyncedSelected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveSelected}
                          className="rounded-md"
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
                        className="rounded-md"
                      >
                        Remove {selectedProducts.size} from Marketplace
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSyncSelectedProducts}
                        size="sm"
                        className="rounded-md"
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
                    ).map((p: any) => ({
                      id: p.id,
                      itemId: p.itemId,
                      name: p.name,
                      sku: p.sku,
                      modelYear: p.modelYear,
                      categoryId: p.categoryId,
                      price: p.price ?? 0,
                      totalQoh: p.totalQoh,
                      totalSellable: p.totalSellable,
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
        result={syncResult}
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
                  Filter by the product's sell price from Lightspeed.
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

