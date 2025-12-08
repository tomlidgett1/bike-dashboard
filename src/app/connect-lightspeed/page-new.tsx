"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import { MetricsHeader } from "@/components/lightspeed/metrics-header";
import { UnifiedCategoryTable } from "@/components/lightspeed/unified-category-table";
import { ProductTableView } from "@/components/lightspeed/product-table-view";
import { SyncProgressModal } from "@/components/lightspeed/sync-progress-modal";
import { DeleteConfirmDialog } from "@/components/lightspeed/delete-confirm-dialog";

type ViewMode = 'categories' | 'products';

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

  const handleSyncSelected = async () => {
    // Get categories that need syncing (not fully synced)
    const categoriesToSync = Array.from(selectedCategories).filter(catId => {
      const category = inventoryData?.categories.find(c => c.categoryId === catId);
      return category && category.notSyncedProducts > 0;
    });

    if (categoriesToSync.length === 0 && selectedProducts.size === 0) {
      return;
    }

    setSyncModalOpen(true);
    setSyncStatus('syncing');
    setSyncProgress(0);
    setSyncPhase('Preparing sync...');
    setSyncMessage('');
    setSyncError('');

    try {
      const body: any = {
        categoryIds: categoriesToSync,
        syncType: 'categories',
      };

      setSyncPhase('Syncing to marketplace...');
      setSyncProgress(50);

      const response = await fetch('/api/lightspeed/sync-from-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      setSyncProgress(100);
      setSyncStatus('success');
      setSyncResult(result.data);
      
      setSelectedCategories(new Set());
      setSelectedProducts(new Set());
      
      await fetchInventoryData();

    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'Unknown error');
    }
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
        body.itemIds = deleteTarget.ids;
      }

      const response = await fetch('/api/products/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Delete failed');
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

  const handleSelectAllProducts = () => {
    const allItemIds = inventoryData?.notSynced.products.map(p => p.itemId) || [];
    setSelectedProducts(new Set(allItemIds));
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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  // Not connected state
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
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

      {/* Main Content */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-950 flex flex-col">
        {loadingInventory ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Tabs and Actions Bar */}
            <div className="px-6 py-4 bg-white dark:bg-card border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                {/* View Mode Tabs */}
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                      viewMode === 'categories'
                        ? "text-gray-800 bg-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70"
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
                        ? "text-gray-800 bg-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70"
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
                </div>

                {/* Action Buttons */}
                {viewMode === 'categories' && selectedCategories.size > 0 && (
                  <div className="flex items-center gap-2">
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
                  </div>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-6">
              <div className="bg-white dark:bg-card rounded-md border border-gray-200 dark:border-gray-800 h-full flex flex-col overflow-hidden">
                {viewMode === 'categories' ? (
                  <UnifiedCategoryTable
                    categories={inventoryData?.categories || []}
                    selectedCategories={selectedCategories}
                    onCategoryToggle={handleCategoryToggle}
                    expandedCategory={expandedCategory}
                    onCategoryExpand={setExpandedCategory}
                  />
                ) : (
                  <ProductTableView
                    products={[
                      ...inventoryData?.notSynced.products.map((p: any) => ({ ...p, isSynced: false })) || [],
                      ...inventoryData?.synced.products.map((p: any) => ({ ...p, isSynced: true })) || [],
                    ].map(p => ({
                      id: p.id,
                      itemId: p.itemId,
                      name: p.name,
                      sku: p.sku,
                      modelYear: p.modelYear,
                      categoryId: p.categoryId,
                      totalQoh: p.totalQoh,
                      totalSellable: p.totalSellable,
                      isSynced: p.isSynced,
                    }))}
                    selectedProducts={selectedProducts}
                    onProductToggle={handleProductToggle}
                    onSelectAll={handleSelectAllProducts}
                    onClearAll={handleClearAllProducts}
                    onDeleteProducts={handleDeleteProducts}
                  />
                )}
              </div>
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
    </>
  );
}

