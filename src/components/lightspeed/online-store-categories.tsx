"use client";

import * as React from "react";
import { ChevronDown, Clock } from "@/components/layout/app-sidebar/dashboard-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Category {
  categoryId: string;
  name: string;
  totalProducts: number;
  syncedProducts: number;
  notSyncedProducts: number;
  syncStatus: "not_synced" | "partial" | "fully_synced";
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
  products: Array<{
    itemId: string;
    name: string | null;
    sku?: string | null;
    totalQoh: number;
    isSynced: boolean;
  }>;
}

interface OnlineStoreCategoryTableProps {
  categories: Category[];
  selectedCategories: Set<string>;
  onCategoryToggle: (categoryId: string) => void;
  expandedCategory: string | null;
  onCategoryExpand: (categoryId: string | null) => void;
  syncFilter?: "not_synced" | "synced";
}

function getInStockNotOnlineCount(products: Category["products"]) {
  return products.filter(
    (product) => (product.totalQoh ?? 0) > 0 && !product.isSynced,
  ).length;
}

function StatusPill({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        None
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {count} in stock, not online
    </span>
  );
}

function formatLastUpdate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function OnlineStoreCategoryTable({
  categories,
  selectedCategories,
  onCategoryToggle,
  expandedCategory,
  onCategoryExpand,
  syncFilter,
}: OnlineStoreCategoryTableProps) {
  const displayed = React.useMemo(() => {
    if (!syncFilter) return categories;
    if (syncFilter === "synced") {
      return categories.filter((c) => c.syncStatus === "fully_synced" || c.syncStatus === "partial");
    }
    return categories.filter((c) => c.syncStatus === "not_synced" || c.syncStatus === "partial");
  }, [categories, syncFilter]);

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead className="sticky top-0 z-10 bg-muted/50">
          <tr className="border-b border-border">
            <th className="w-12 px-4 py-3" />
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Auto-update</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Last update</th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {displayed.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                {syncFilter === "synced"
                  ? "Nothing on your online store yet. Tick a category and choose Add to store."
                  : syncFilter === "not_synced"
                    ? "Every category is already on your online store."
                    : "No categories found."}
              </td>
            </tr>
          ) : (
            displayed.map((category) => {
              const isSelected = selectedCategories.has(category.categoryId);
              const isExpanded = expandedCategory === category.categoryId;
              const inStockNotOnlineCount = getInStockNotOnlineCount(category.products);
              return (
                <React.Fragment key={category.categoryId}>
                  <tr className="border-b border-border transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Checkbox checked={isSelected} onCheckedChange={() => onCategoryToggle(category.categoryId)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-foreground">{category.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill count={inStockNotOnlineCount} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {category.autoSyncEnabled ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          On
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-gray-400" />
                          Off
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatLastUpdate(category.lastSyncedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onCategoryExpand(isExpanded ? null : category.categoryId)}
                        aria-label={isExpanded ? "Hide products" : "Show products"}
                        className="rounded p-1 transition-colors hover:bg-muted"
                      >
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="border-y border-border bg-muted/30 px-6 py-3">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Stock</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {category.products.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                    No products in this category.
                                  </td>
                                </tr>
                              ) : (
                                category.products.map((product) => {
                                  const inStockNotOnline =
                                    (product.totalQoh ?? 0) > 0 && !product.isSynced;

                                  return (
                                  <tr
                                    key={product.itemId}
                                    className={cn(
                                      "border-b border-border last:border-b-0",
                                      inStockNotOnline && "bg-amber-50/60 dark:bg-amber-950/20",
                                    )}
                                  >
                                    <td className="px-3 py-2 text-xs font-medium text-foreground">{product.name}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{product.sku || "—"}</td>
                                    <td className="px-3 py-2 text-center text-xs font-medium tabular-nums text-foreground">
                                      {product.totalQoh}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {product.isSynced ? (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                          Online
                                        </span>
                                      ) : inStockNotOnline ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                          In stock, not online
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                                          Not online
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
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
