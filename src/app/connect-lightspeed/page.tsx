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
import { CategoryTreeView } from "@/components/lightspeed/category-tree-view";
import { ProductTableView } from "@/components/lightspeed/product-table-view";
import { SyncProgressModal } from "@/components/lightspeed/sync-progress-modal";
import { DeleteConfirmDialog } from "@/components/lightspeed/delete-confirm-dialog";

type ViewMode = 'categories' | 'products';

interface InventoryData {
  categories: Array<{
    categoryId: string;
    name: string;
    productCount: number;
    products: any[];
  }>;
  products: any[];
  totals: {
    totalProducts: number;
    totalStock: number;
    categoriesCount: number;
  };
}

export default function ConnectLightspeedPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<ViewMode>('categories');
  const [inventoryData, setInventoryData] = React.useState<InventoryData | null>(null);
  const [loadingInventory, setLoadingInventory] = React.useState(false);
  const [selectedCategories, setSelectedCategories] = React.useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  
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
    const allItemIds = inventoryData?.products.map(p => p.lightspeed_item_id) || [];
    setSelectedProducts(new Set(allItemIds));
  };

  const handleClearAllProducts = () => {
    setSelectedProducts(new Set());
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
      
      if (viewMode === 'categories' && selectedCategories.size > 0) {
        body.categoryIds = Array.from(selectedCategories);
        body.syncType = 'categories';
      } else if (viewMode === 'products' && selectedProducts.size > 0) {
        body.itemIds = Array.from(selectedProducts);
        body.syncType = 'products';
      }

      setSyncPhase('Syncing to marketplace...');
      setSyncProgress(50);

      const response = await fetch('/api/lightspeed/sync-selected', {
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
      setSelectedCategories(new Set());
      setSelectedProducts(new Set());
      
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
      if (deleteTarget.type === 'categories') {
        setSelectedCategories(new Set());
      } else {
        setSelectedProducts(new Set());
      }

      setDeleteDialogOpen(false);
      setDeleteTarget(null);

    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteProducts = (itemIds: string[]) => {
    setDeleteTarget({ type: 'products', ids: itemIds });
    setDeleteDialogOpen(true);
  };

  const handleDeleteCategories = () => {
    if (selectedCategories.size === 0) return;
    setDeleteTarget({ type: 'categories', ids: Array.from(selectedCategories) });
    setDeleteDialogOpen(true);
  };

  // Get products for selected category
  const categoryProducts = React.useMemo(() => {
    if (!selectedCategoryId || !inventoryData) return [];
    const category = inventoryData.categories.find(c => c.categoryId === selectedCategoryId);
    return category?.products || [];
  }, [selectedCategoryId, inventoryData]);

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
        lastSyncTime={connection?.last_sync_at ? new Date(connection.last_sync_at) : null}
        isRefreshing={loadingInventory}
        onRefresh={fetchInventoryData}
        onDisconnect={disconnect}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* View Mode Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-card px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Tab Switcher */}
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
                Categories
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
                Products
                {selectedProducts.size > 0 && (
                  <Badge variant="secondary" className="rounded-md ml-1 h-5 px-1.5 text-xs">
                    {selectedProducts.size}
                  </Badge>
                )}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {viewMode === 'categories' && selectedCategories.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteCategories}
                    className="rounded-md"
                  >
                    Delete Selected
                  </Button>
                  <Button
                    onClick={handleSyncSelected}
                    size="sm"
                    className="rounded-md"
                  >
                    Sync {selectedCategories.size} {selectedCategories.size === 1 ? 'Category' : 'Categories'}
                  </Button>
                </>
              )}
              
              {viewMode === 'products' && selectedProducts.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteProducts(Array.from(selectedProducts))}
                    className="rounded-md"
                  >
                    Delete Selected
                  </Button>
                  <Button
                    onClick={handleSyncSelected}
                    size="sm"
                    className="rounded-md"
                  >
                    Sync {selectedProducts.size} {selectedProducts.size === 1 ? 'Product' : 'Products'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        {loadingInventory ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex">
            {viewMode === 'categories' ? (
              <>
                {/* Left Panel - Category Tree */}
                <div className="w-80 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-card">
                  <CategoryTreeView
                    categories={inventoryData?.categories || []}
                    selectedCategories={selectedCategories}
                    onCategoryToggle={handleCategoryToggle}
                    onCategoryClick={setSelectedCategoryId}
                    selectedCategoryId={selectedCategoryId}
                  />
                </div>

                {/* Right Panel - Category Products */}
                <div className="flex-1 bg-gray-50 dark:bg-gray-950">
                  {selectedCategoryId ? (
                    <div className="h-full flex flex-col">
                      <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-card">
                        <h2 className="text-lg font-semibold">
                          {inventoryData?.categories.find(c => c.categoryId === selectedCategoryId)?.name || 'Category'}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          {categoryProducts.length} products in this category
                        </p>
                      </div>
                      <div className="flex-1 overflow-auto p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {categoryProducts.map((product: any) => (
                            <div
                              key={product.itemId}
                              className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-card p-4 hover:shadow-md transition-shadow"
                            >
                              <div className="text-sm font-medium line-clamp-2 mb-2">
                                {product.name}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div>SKU: {product.sku || 'N/A'}</div>
                                <div>Stock: {product.totalQoh}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Select a category to view products
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Products Table View */
              <div className="flex-1 bg-white dark:bg-card">
                <ProductTableView
                  products={inventoryData?.products.map(p => ({
                    id: p.id,
                    itemId: p.lightspeed_item_id,
                    name: p.description,
                    sku: p.system_sku,
                    modelYear: p.model_year,
                    categoryId: p.category_id,
                    totalQoh: p.total_qoh,
                    totalSellable: p.total_sellable,
                  })) || []}
                  selectedProducts={selectedProducts}
                  onProductToggle={handleProductToggle}
                  onSelectAll={handleSelectAllProducts}
                  onClearAll={handleClearAllProducts}
                  onDeleteProducts={handleDeleteProducts}
                />
              </div>
            )}
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
