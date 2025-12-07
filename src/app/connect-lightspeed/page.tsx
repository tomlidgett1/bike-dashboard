"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, AlertCircle, ChevronDown, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import { MetricsHeader } from "@/components/lightspeed/metrics-header";
import { SyncProgressModal } from "@/components/lightspeed/sync-progress-modal";
import { DeleteConfirmDialog } from "@/components/lightspeed/delete-confirm-dialog";

type ViewMode = 'categories' | 'products';

interface Category {
  categoryId: string;
  name: string;
  productCount: number;
  products: any[];
}

interface InventoryData {
  notSynced: {
    categories: Category[];
    products: any[];
  };
  synced: {
    categories: Category[];
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
  const [selectedNotSyncedCategories, setSelectedNotSyncedCategories] = React.useState<Set<string>>(new Set());
  const [selectedNotSyncedProducts, setSelectedNotSyncedProducts] = React.useState<Set<string>>(new Set());
  const [selectedSyncedProducts, setSelectedSyncedProducts] = React.useState<Set<string>>(new Set());
  
  // Expanded categories
  const [expandedNotSyncedCat, setExpandedNotSyncedCat] = React.useState<string | null>(null);
  const [expandedSyncedCat, setExpandedSyncedCat] = React.useState<string | null>(null);
  
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

  const handleSyncSelected = async () => {
    setSyncModalOpen(true);
    setSyncStatus('syncing');
    setSyncProgress(0);
    setSyncPhase('Preparing sync...');
    setSyncMessage('');
    setSyncError('');

    try {
      const body: any = {};
      
      if (viewMode === 'categories' && selectedNotSyncedCategories.size > 0) {
        body.categoryIds = Array.from(selectedNotSyncedCategories);
        body.syncType = 'categories';
      } else if (viewMode === 'products' && selectedNotSyncedProducts.size > 0) {
        body.itemIds = Array.from(selectedNotSyncedProducts);
        body.syncType = 'products';
      }

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
      
      // Clear selections
      setSelectedNotSyncedCategories(new Set());
      setSelectedNotSyncedProducts(new Set());
      
      // Refresh inventory data
      await fetchInventoryData();

    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'Unknown error');
    }
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

      // Refresh inventory
      await fetchInventoryData();
      
      // Clear selections
      setSelectedSyncedProducts(new Set());

      setDeleteDialogOpen(false);
      setDeleteTarget(null);

    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

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
      <div className="flex-1 bg-gray-50 dark:bg-gray-950">
        {loadingInventory ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* View Mode Tabs */}
            <div className="px-6 py-4 bg-white dark:bg-card border-b border-gray-200 dark:border-gray-800">
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
                </button>
              </div>
            </div>

            {/* Side by Side Layout */}
            <div className="flex-1 flex gap-6 p-6 overflow-hidden">
              {/* NOT SYNCED YET SECTION - LEFT */}
            <div className="bg-white dark:bg-card rounded-md border border-gray-200 dark:border-gray-800">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Not Synced Yet</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {inventoryData?.totals.totalNotSynced || 0} products available to sync to marketplace
                  </p>
                </div>
                {viewMode === 'categories' && selectedNotSyncedCategories.size > 0 && (
                  <Button
                    onClick={handleSyncSelected}
                    size="sm"
                    className="rounded-md"
                  >
                    Sync {selectedNotSyncedCategories.size} {selectedNotSyncedCategories.size === 1 ? 'Category' : 'Categories'}
                  </Button>
                )}
                {viewMode === 'products' && selectedNotSyncedProducts.size > 0 && (
                  <Button
                    onClick={handleSyncSelected}
                    size="sm"
                    className="rounded-md"
                  >
                    Sync {selectedNotSyncedProducts.size} {selectedNotSyncedProducts.size === 1 ? 'Product' : 'Products'}
                  </Button>
                )}
              </div>

              <div className="p-6">
                {viewMode === 'categories' ? (
                  /* Category View */
                  <div className="space-y-2">
                    {inventoryData?.notSynced.categories.map((category) => {
                      const isSelected = selectedNotSyncedCategories.has(category.categoryId);
                      const isExpanded = expandedNotSyncedCat === category.categoryId;

                      return (
                        <div key={category.categoryId} className="rounded-md border border-gray-200 dark:border-gray-800">
                          <div className="flex items-center gap-3 p-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {
                                setSelectedNotSyncedCategories(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(category.categoryId)) {
                                    newSet.delete(category.categoryId);
                                  } else {
                                    newSet.add(category.categoryId);
                                  }
                                  return newSet;
                                });
                              }}
                            />
                            <button
                              onClick={() => setExpandedNotSyncedCat(isExpanded ? null : category.categoryId)}
                              className="flex-1 flex items-center justify-between text-left hover:opacity-70 transition-opacity"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium">{category.name}</div>
                                  {category.syncedCount > 0 && (
                                    <Badge variant="secondary" className="rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                                      {category.syncedCount} synced
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {category.productCount} products not synced yet
                                </div>
                              </div>
                              <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", isExpanded && "rotate-180")} />
                            </button>
                          </div>

                          {/* Expanded Products List */}
                          {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-900">
                              <div className="space-y-2">
                                {category.products.map((product: any) => (
                                  <div key={product.itemId} className="flex items-center justify-between p-2 rounded-md bg-white dark:bg-card">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{product.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        SKU: {product.sku || 'N/A'} • Stock: {product.totalQoh}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {(!inventoryData?.notSynced.categories || inventoryData.notSynced.categories.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">
                        All products have been synced to the marketplace
                      </div>
                    )}
                  </div>
                ) : (
                  /* Products View */
                  <div className="space-y-2">
                    {inventoryData?.notSynced.products.map((product: any) => {
                      const isSelected = selectedNotSyncedProducts.has(product.itemId);

                      return (
                        <div key={product.itemId} className="flex items-center gap-3 p-4 rounded-md border border-gray-200 dark:border-gray-800">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {
                              setSelectedNotSyncedProducts(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(product.itemId)) {
                                  newSet.delete(product.itemId);
                                } else {
                                  newSet.add(product.itemId);
                                }
                                return newSet;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              SKU: {product.sku || 'N/A'} • Category: {product.categoryName} • Stock: {product.totalQoh}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {(!inventoryData?.notSynced.products || inventoryData.notSynced.products.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">
                        All products have been synced to the marketplace
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>

              {/* ALREADY SYNCED SECTION - RIGHT */}
              <div className="flex-1 flex flex-col bg-white dark:bg-card rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      Already Synced
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {inventoryData?.totals.totalSynced || 0} products currently on marketplace
                    </p>
                  </div>
                {viewMode === 'products' && selectedSyncedProducts.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteTarget({ type: 'products', ids: Array.from(selectedSyncedProducts) });
                      setDeleteDialogOpen(true);
                    }}
                    className="rounded-md"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove {selectedSyncedProducts.size} from Marketplace
                  </Button>
                )}
              </div>

              <div className="p-6">
                {viewMode === 'categories' ? (
                  /* Category View */
                  <div className="space-y-2">
                    {inventoryData?.synced.categories.map((category) => {
                      const isExpanded = expandedSyncedCat === category.categoryId;

                      return (
                        <div key={category.categoryId} className="rounded-md border border-gray-200 dark:border-gray-800">
                          <button
                            onClick={() => setExpandedSyncedCat(isExpanded ? null : category.categoryId)}
                            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors rounded-md"
                          >
                            <div>
                              <div className="text-sm font-medium">{category.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {category.productCount} products on marketplace
                              </div>
                            </div>
                            <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", isExpanded && "rotate-180")} />
                          </button>

                          {/* Expanded Products List */}
                          {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-900">
                              <div className="space-y-2">
                                {category.products.map((product: any) => (
                                  <div key={product.itemId} className="flex items-center justify-between p-2 rounded-md bg-white dark:bg-card">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{product.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        SKU: {product.sku || 'N/A'} • Stock: {product.totalQoh}
                                      </div>
                                    </div>
                                    <Badge variant="secondary" className="rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                      Live
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {(!inventoryData?.synced.categories || inventoryData.synced.categories.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">
                        No products synced yet. Select categories above to get started.
                      </div>
                    )}
                  </div>
                ) : (
                  /* Products View */
                  <div className="space-y-2">
                    {inventoryData?.synced.products.map((product: any) => {
                      const isSelected = selectedSyncedProducts.has(product.itemId);

                      return (
                        <div key={product.itemId} className="flex items-center gap-3 p-4 rounded-md border border-gray-200 dark:border-gray-800">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {
                              setSelectedSyncedProducts(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(product.itemId)) {
                                  newSet.delete(product.itemId);
                                } else {
                                  newSet.add(product.itemId);
                                }
                                return newSet;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              SKU: {product.sku || 'N/A'} • Category: {product.categoryName} • Stock: {product.totalQoh}
                            </div>
                          </div>
                          <Badge variant="secondary" className="rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Live
                          </Badge>
                        </div>
                      );
                    })}

                    {(!inventoryData?.synced.products || inventoryData.synced.products.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">
                        No products synced yet. Select products above to get started.
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
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
