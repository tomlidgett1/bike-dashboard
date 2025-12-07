"use client";

import * as React from "react";
import { ChevronDown, CheckCircle2, Clock } from "lucide-react";
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
        <Badge variant="secondary" className="rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Fully Synced
        </Badge>
      );
    } else if (status === 'partial') {
      return (
        <Badge variant="secondary" className="rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          Partial ({syncedCount}/{totalCount})
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="rounded-md bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
          Not Synced
        </Badge>
      );
    }
  };

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="w-12 px-4 py-3"></th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Category Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Products
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Synced / Total
            </th>
            <th className="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
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
                    <td className="px-4 py-3">
                      <div className="text-sm text-muted-foreground">
                        {category.totalProducts} total
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">
                        {category.syncedProducts} / {category.totalProducts}
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

                  {/* Expanded Products */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="px-0 py-0">
                        <div className="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800">
                          <div className="px-16 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {category.products.map((product: any) => (
                                <div
                                  key={product.itemId}
                                  className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-card p-3"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{product.name}</div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        SKU: {product.sku || 'N/A'}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        Stock: {product.totalQoh}
                                      </div>
                                    </div>
                                    {product.isSynced && (
                                      <Badge variant="secondary" className="rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs flex-shrink-0">
                                        Live
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
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

