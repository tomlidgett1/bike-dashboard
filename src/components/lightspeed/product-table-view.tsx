"use client";

import * as React from "react";
import { Search, X, Trash2, Package, SlidersHorizontal } from "@/components/layout/app-sidebar/dashboard-icons";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  itemId: string;
  name: string;
  sku: string | null;
  modelYear: string | null;
  categoryId: string | null;
  price: number;
  totalQoh: number;
  totalSellable: number;
  isSynced?: boolean;
}

export interface SyncFilters {
  minSoh: string;
  maxSoh: string;
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
}

interface ProductTableViewProps {
  products: Product[];
  selectedProducts: Set<string>;
  onProductToggle: (itemId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onDeleteProducts: (itemIds: string[]) => void;
  syncFilters?: SyncFilters;
  activeFilterCount?: number;
  onOpenFilters?: () => void;
}

function passesFilters(product: Product, filters: SyncFilters): boolean {
  const minSoh = filters.inStockOnly ? 1 : (filters.minSoh !== '' ? parseFloat(filters.minSoh) : null);
  const maxSoh = filters.maxSoh !== '' ? parseFloat(filters.maxSoh) : null;
  const minPrice = filters.minPrice !== '' ? parseFloat(filters.minPrice) : null;
  const maxPrice = filters.maxPrice !== '' ? parseFloat(filters.maxPrice) : null;

  if (minSoh !== null && (product.totalQoh ?? 0) < minSoh) return false;
  if (maxSoh !== null && (product.totalQoh ?? 0) > maxSoh) return false;
  if (minPrice !== null && (product.price ?? 0) < minPrice) return false;
  if (maxPrice !== null && (product.price ?? 0) > maxPrice) return false;

  return true;
}

export function ProductTableView({
  products,
  selectedProducts,
  onProductToggle,
  onSelectAll,
  onClearAll,
  onDeleteProducts,
  syncFilters,
  activeFilterCount = 0,
  onOpenFilters,
}: ProductTableViewProps) {
  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<'name' | 'sku' | 'stock' | 'price'>('name');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');

  const filteredAndSortedProducts = React.useMemo(() => {
    let filtered = products;

    // Apply sync filters first
    if (syncFilters && activeFilterCount > 0) {
      filtered = filtered.filter(p => passesFilters(p, syncFilters));
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.sku?.toLowerCase().includes(searchLower) ||
        p.itemId?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'sku':
          comparison = (a.sku || '').localeCompare(b.sku || '');
          break;
        case 'stock':
          comparison = a.totalQoh - b.totalQoh;
          break;
        case 'price':
          comparison = (a.price ?? 0) - (b.price ?? 0);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [products, search, sortBy, sortOrder, syncFilters, activeFilterCount]);

  const hiddenByFilterCount = React.useMemo(() => {
    if (!syncFilters || activeFilterCount === 0) return 0;
    return products.filter(p => !passesFilters(p, syncFilters)).length;
  }, [products, syncFilters, activeFilterCount]);

  const allSelected = filteredAndSortedProducts.length > 0 &&
    filteredAndSortedProducts.every(p => selectedProducts.has(p.itemId));
  const someSelected = filteredAndSortedProducts.some(p => selectedProducts.has(p.itemId));

  const handleSort = (field: 'name' | 'sku' | 'stock' | 'price') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const SortIndicator = ({ field }: { field: typeof sortBy }) =>
    sortBy === field ? (
      <span className="text-foreground">{sortOrder === 'asc' ? '↑' : '↓'}</span>
    ) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
        {/* Filter notice */}
        {hiddenByFilterCount > 0 && (
          <div className="flex items-center justify-between rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-400">
              <SlidersHorizontal className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                <span className="font-semibold">{hiddenByFilterCount.toLocaleString()}</span> product{hiddenByFilterCount !== 1 ? 's' : ''} hidden by sync filters
              </span>
            </div>
            {onOpenFilters && (
              <button
                onClick={onOpenFilters}
                className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:no-underline flex-shrink-0 ml-3"
              >
                Edit filters
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search products by name, SKU, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 rounded-md"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Stats and Actions */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {filteredAndSortedProducts.length.toLocaleString()} of {products.length.toLocaleString()} products
          </div>

          {selectedProducts.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {selectedProducts.size} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
                className="h-7 text-xs rounded-md"
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="w-12 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  ref={(ref) => {
                    if (ref) {
                      (ref as any).indeterminate = someSelected && !allSelected;
                    }
                  }}
                  onCheckedChange={() => {
                    if (allSelected || someSelected) {
                      onClearAll();
                    } else {
                      onSelectAll();
                    }
                  }}
                />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Product Name
                  <SortIndicator field="name" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('sku')}
              >
                <div className="flex items-center gap-1">
                  SKU
                  <SortIndicator field="sku" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Category
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('price')}
              >
                <div className="flex items-center justify-end gap-1">
                  Price
                  <SortIndicator field="price" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('stock')}
              >
                <div className="flex items-center gap-1">
                  Stock (SOH)
                  <SortIndicator field="stock" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
              <th className="w-16 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {activeFilterCount > 0
                    ? 'No products match the current sync filters.'
                    : 'No products found'}
                </td>
              </tr>
            ) : (
              filteredAndSortedProducts.map((product) => {
                const isSelected = selectedProducts.has(product.itemId);

                return (
                  <tr
                    key={product.itemId}
                    className={cn(
                      "border-b border-gray-200 dark:border-gray-800 transition-colors",
                      isSelected && "bg-blue-50 dark:bg-blue-900/10"
                    )}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onProductToggle(product.itemId)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium truncate max-w-xs">
                        {product.name || 'Unnamed Product'}
                      </div>
                      {product.modelYear && (
                        <div className="text-xs text-muted-foreground">{product.modelYear}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-muted-foreground font-mono">
                        {product.sku || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="rounded-md text-xs">
                        {product.categoryId || 'N/A'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium tabular-nums">
                        {product.price > 0
                          ? `$${product.price.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : <span className="text-muted-foreground">—</span>
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium tabular-nums">{product.totalQoh}</span>
                        <span className="text-xs text-muted-foreground">
                          ({product.totalSellable} sellable)
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {product.isSynced ? (
                        <Badge variant="secondary" className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1.5 w-fit">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          Live
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1.5 w-fit">
                          <span className="h-2 w-2 rounded-full bg-gray-400" />
                          Not Synced
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {product.isSynced && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDeleteProducts([product.itemId])}
                        >
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
