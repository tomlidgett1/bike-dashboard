"use client";

import * as React from "react";
import { Search, X, Trash2, Package } from "lucide-react";
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
  totalQoh: number;
  totalSellable: number;
}

interface ProductTableViewProps {
  products: Product[];
  selectedProducts: Set<string>;
  onProductToggle: (itemId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onDeleteProducts: (itemIds: string[]) => void;
}

export function ProductTableView({
  products,
  selectedProducts,
  onProductToggle,
  onSelectAll,
  onClearAll,
  onDeleteProducts,
}: ProductTableViewProps) {
  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<'name' | 'sku' | 'stock'>('name');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');

  const filteredAndSortedProducts = React.useMemo(() => {
    let filtered = products;

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = products.filter(p => 
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
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [products, search, sortBy, sortOrder]);

  const allSelected = filteredAndSortedProducts.length > 0 && 
    filteredAndSortedProducts.every(p => selectedProducts.has(p.itemId));
  const someSelected = filteredAndSortedProducts.some(p => selectedProducts.has(p.itemId));

  const handleSort = (field: 'name' | 'sku' | 'stock') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
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
            Showing {filteredAndSortedProducts.length} of {products.length} products
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
                  {sortBy === 'name' && (
                    <span className="text-foreground">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('sku')}
              >
                <div className="flex items-center gap-1">
                  SKU
                  {sortBy === 'sku' && (
                    <span className="text-foreground">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Category
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('stock')}
              >
                <div className="flex items-center gap-1">
                  Stock
                  {sortBy === 'stock' && (
                    <span className="text-foreground">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th className="w-24 px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No products found
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
                      <div className="text-sm font-medium truncate max-w-md">
                        {product.name || 'Unnamed Product'}
                      </div>
                      {product.modelYear && (
                        <div className="text-xs text-muted-foreground">
                          {product.modelYear}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-muted-foreground font-mono">
                        {product.sku || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="rounded-md text-xs">
                        {product.categoryId || 'N/A'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {product.totalQoh}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({product.totalSellable} sellable)
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteProducts([product.itemId])}
                        className="h-8 w-8 p-0 rounded-md"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
                      </Button>
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

