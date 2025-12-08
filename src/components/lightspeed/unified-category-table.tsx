"use client";

import * as React from "react";
import { ChevronDown, CheckCircle2, Clock, Zap } from "lucide-react";
import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Category {
  categoryId: string;
  name: string;
  totalProducts: number;
  syncedProducts: number;
  notSyncedProducts: number;
  syncStatus: 'not_synced' | 'partial' | 'fully_synced';
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
  products: any[];
}

interface UnifiedCategoryTableProps {
  categories: Category[];
  selectedCategories: Set<string>;
  onCategoryToggle: (categoryId: string) => void;
  expandedCategory: string | null;
  onCategoryExpand: (categoryId: string | null) => void;
}

export function UnifiedCategoryTable({
  categories,
  selectedCategories,
  onCategoryToggle,
  expandedCategory,
  onCategoryExpand,
}: UnifiedCategoryTableProps) {
  const getSyncBadge = (status: string, syncedCount: number, totalCount: number) => {
    if (status === 'fully_synced') {
      return (
        <Badge variant="secondary" className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Synced
        </Badge>
      );
    } else if (status === 'partial') {
      return (
        <Badge variant="secondary" className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Partial ({syncedCount}/{totalCount})
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          Not Synced
        </Badge>
      );
    }
  };

  const formatLastSync = (date: string | null) => {
    if (!date) return '-';
    
    const syncDate = new Date(date);
    const now = new Date();
    const diff = now.getTime() - syncDate.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return syncDate.toLocaleDateString();
  };

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="w-12 px-4 py-3"></th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Category Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Status
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Synced / Total
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Auto-Sync
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Last Synced
            </th>
            <th className="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                No categories found
              </td>
            </tr>
          ) : (
            categories.map((category) => {
              const isSelected = selectedCategories.has(category.categoryId);
              const isExpanded = expandedCategory === category.categoryId;

              return (
                <React.Fragment key={category.categoryId}>
                  <tr className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onCategoryToggle(category.categoryId)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{category.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      {getSyncBadge(category.syncStatus, category.syncedProducts, category.totalProducts)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-sm font-medium">
                        {category.syncedProducts} / {category.totalProducts}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {category.autoSyncEnabled ? (
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">ON</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1">
                          <span className="h-2 w-2 rounded-full bg-gray-400" />
                          <span className="text-xs text-gray-700 dark:text-gray-300">Off</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatLastSync(category.lastSyncedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onCategoryExpand(isExpanded ? null : category.categoryId)}
                        className="hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors"
                      >
                        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", isExpanded && "rotate-180")} />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Products - Compact Table */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="px-0 py-0">
                        <div className="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800">
                          <div className="px-6 py-3">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-800">
                                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Product Name
                                  </th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    SKU
                                  </th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Stock
                                  </th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {category.products.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                      No products in this category
                                    </td>
                                  </tr>
                                ) : (
                                  category.products.map((product: any) => (
                                    <tr 
                                      key={product.itemId}
                                      className="border-b border-gray-200 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                                    >
                                      <td className="px-3 py-2">
                                        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                                          {product.name}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="text-xs text-muted-foreground font-mono">
                                          {product.sku || 'N/A'}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                                          {product.totalQoh}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {product.isSynced ? (
                                          <Badge variant="secondary" className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1.5 w-fit mx-auto">
                                            <span className="h-2 w-2 rounded-full bg-green-500" />
                                            <span className="text-xs">Live</span>
                                          </Badge>
                                        ) : (
                                          <Badge variant="secondary" className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 flex items-center gap-1.5 w-fit mx-auto">
                                            <span className="h-2 w-2 rounded-full bg-gray-400" />
                                            <span className="text-xs">Not Synced</span>
                                          </Badge>
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

