"use client";

import * as React from "react";
import { Package, ChevronRight, X, TrendingUp, Store } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  BrowseFiltersToolbar,
  type ProductGridLayout,
} from "@/components/marketplace/browse-filters-toolbar";
import {
  MobileFilterContent,
  countActiveFilters,
  type AdvancedFiltersState,
} from "@/components/marketplace/advanced-filters";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { BikeStoresPicker } from "@/components/marketplace/bike-stores-picker";

// ============================================================
// Unified Filter Bar — view tabs + browse toolbar (hardcoded categories)
// ============================================================

export type ViewMode = "trending" | "all";
export type ListingTypeFilter = "all" | "stores" | "individuals";

export type { ProductGridLayout };

interface UnifiedFilterBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;

  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onLevel1Change: (category: string | null) => void;
  onLevel2Change: (subcategory: string | null) => void;
  onLevel3Change: (level3: string | null) => void;

  listingTypeFilter: ListingTypeFilter;
  onListingTypeChange: (filter: ListingTypeFilter) => void;

  productCount?: number;

  additionalFilters?: React.ReactNode;

  categoryPillsRef?: React.RefObject<HTMLDivElement | null>;

  onNavigateToStores?: () => void;

  selectedStoreId?: string | null;
  onStoreSelect?: (storeId: string) => void;

  browseFilters: AdvancedFiltersState;
  onBrowseFiltersChange: (f: AdvancedFiltersState) => void;
  onBrowseFiltersApply: () => void;
  onBrowseFiltersReset: () => void;
  productGridLayout: ProductGridLayout;
  onProductGridLayoutChange: (layout: ProductGridLayout) => void;

  /** Mobile Browse: filter sheet open state (FAB lives in MarketplaceHeader). */
  mobileBrowseSheetOpen?: boolean;
  onMobileBrowseSheetOpenChange?: (open: boolean) => void;
}

export function UnifiedFilterBar({
  viewMode,
  onViewModeChange,
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onLevel1Change,
  onLevel2Change,
  onNavigateToStores,
  selectedStoreId,
  onStoreSelect,
  onLevel3Change,
  listingTypeFilter,
  onListingTypeChange,
  productCount,
  additionalFilters,
  categoryPillsRef,
  browseFilters,
  onBrowseFiltersChange,
  onBrowseFiltersApply,
  onBrowseFiltersReset,
  productGridLayout,
  onProductGridLayoutChange,
  mobileBrowseSheetOpen,
  onMobileBrowseSheetOpenChange,
}: UnifiedFilterBarProps) {
  const [uncontrolledBrowseOpen, setUncontrolledBrowseOpen] = React.useState(false);
  const browseSheetControlled =
    mobileBrowseSheetOpen !== undefined &&
    onMobileBrowseSheetOpenChange !== undefined;
  const browseSheetOpen = browseSheetControlled
    ? mobileBrowseSheetOpen!
    : uncontrolledBrowseOpen;
  const setBrowseSheetOpen = browseSheetControlled
    ? onMobileBrowseSheetOpenChange!
    : setUncontrolledBrowseOpen;
  const isStoresMode = listingTypeFilter === "stores";
  const activeTabIndex = isStoresMode ? 2 : viewMode === "trending" ? 0 : 1;
  const tabIndicatorTransition = {
    type: "tween" as const,
    duration: 0.2,
    ease: [0.04, 0.62, 0.23, 0.98] as const,
  };

  const clearAllCategories = () => {
    onLevel1Change(null);
    onLevel2Change(null);
    onLevel3Change(null);
  };

  const breadcrumbs = [];
  if (selectedLevel1) {
    breadcrumbs.push({
      label: selectedLevel1,
      onClick: () => {
        onLevel2Change(null);
        onLevel3Change(null);
      },
    });
  }
  if (selectedLevel2) {
    breadcrumbs.push({
      label: selectedLevel2,
      onClick: () => {
        onLevel3Change(null);
      },
    });
  }
  if (selectedLevel3) {
    breadcrumbs.push({ label: selectedLevel3, onClick: () => {} });
  }

  const isOnBrowseMode = viewMode === "all";
  const showBrowseChrome = isOnBrowseMode && !isStoresMode;
  const mobileBrowseAdvancedCount = countActiveFilters(browseFilters);

  return (
    <div className={cn(showBrowseChrome && "space-y-1.5 sm:space-y-3")}>
      <div className="flex flex-col gap-3 sm:min-h-9 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2 sm:hidden pt-1 pb-0.5 pr-3">
          <div className="relative mx-3 min-w-0 flex-1 h-12 rounded-md bg-gray-100 p-0.5">
            <motion.div
              className="absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-white shadow-sm"
              animate={{ x: `${activeTabIndex * 100}%` }}
              transition={tabIndicatorTransition}
              style={{ width: "calc((100% - 0.5rem) / 3)" }}
            />
            <div className="relative grid h-10 grid-cols-3">
              <button
                type="button"
                onClick={() => onViewModeChange("trending")}
                className="relative flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
              >
                <span
                  className={cn(
                    "relative z-10 flex items-center gap-1.5 transition-colors duration-200",
                    viewMode === "trending" && !isStoresMode
                      ? "text-gray-900"
                      : "text-gray-600"
                  )}
                >
                  <TrendingUp className="h-4 w-4 flex-shrink-0" />
                  <span>Hot</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onViewModeChange("all")}
                className="relative flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
              >
                <span
                  className={cn(
                    "relative z-10 flex items-center gap-1.5 transition-colors duration-200",
                    viewMode === "all" && !isStoresMode
                      ? "text-gray-900"
                      : "text-gray-600"
                  )}
                >
                  <Package className="h-4 w-4 flex-shrink-0" />
                  <span>Browse</span>
                </span>
              </button>

              <button
                type="button"
                onClick={onNavigateToStores}
                className="relative flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
              >
                <span
                  className={cn(
                    "relative z-10 flex items-center gap-1.5 transition-colors duration-200",
                    isStoresMode ? "text-gray-900" : "text-gray-600"
                  )}
                >
                  <Store className="h-4 w-4 flex-shrink-0" />
                  <span>Stores</span>
                </span>
              </button>
            </div>
          </div>
          {onStoreSelect && (
            <BikeStoresPicker
              selectedStoreId={selectedStoreId}
              onStoreSelect={onStoreSelect}
              onAllStores={onNavigateToStores}
              className="shrink-0"
            />
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2 self-start">
        <div className="relative h-9 min-w-[328px] grid-cols-3 rounded-md bg-gray-100 p-0.5 grid">
          <motion.div
            className="absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-white shadow-sm"
            animate={{ x: `${activeTabIndex * 100}%` }}
            transition={tabIndicatorTransition}
            style={{ width: "calc((100% - 0.25rem) / 3)" }}
          />
          <button
            type="button"
            onClick={() => onViewModeChange("trending")}
            className="relative flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <span
              className={cn(
                "relative z-10 flex items-center gap-1.5 transition-colors duration-200",
                viewMode === "trending" && !isStoresMode
                  ? "text-gray-900"
                  : "text-gray-600 hover:text-gray-800"
              )}
            >
              <TrendingUp className="h-4 w-4" />
              Trending
            </span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange("all")}
            className="relative flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <span
              className={cn(
                "relative z-10 flex items-center gap-1.5 transition-colors duration-200",
                viewMode === "all" && !isStoresMode
                  ? "text-gray-900"
                  : "text-gray-600 hover:text-gray-800"
              )}
            >
              <Package className="h-4 w-4" />
              Browse
            </span>
          </button>

          <button
            type="button"
            onClick={onNavigateToStores}
            className="relative flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
          >
            <span
              className={cn(
                "relative z-10 flex items-center gap-1.5 transition-colors duration-200",
                isStoresMode ? "text-gray-900" : "text-gray-600 hover:text-gray-800"
              )}
            >
              <Store className="h-4 w-4" />
              Bike Stores
            </span>
          </button>
        </div>
        {onStoreSelect && (
          <BikeStoresPicker
            selectedStoreId={selectedStoreId}
            onStoreSelect={onStoreSelect}
            onAllStores={onNavigateToStores}
          />
        )}
        </div>
      </div>

      {showBrowseChrome && (
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.04,0.62,0.23,0.98)] motion-reduce:transition-none",
          "grid-rows-[1fr]",
        )}
      >
        <div
          className={cn(
            "min-h-0 overflow-hidden [contain:content]",
            !showBrowseChrome && "pointer-events-none",
          )}
        >
          {/* Desktop: inline category toolbar + advanced control */}
          <div className="hidden sm:block px-3 sm:px-0">
            {breadcrumbs.length > 0 && (
              <div className="mb-3 flex items-center gap-1 overflow-x-auto scrollbar-hide sm:mb-2.5">
                <button
                  type="button"
                  onClick={clearAllCategories}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors whitespace-nowrap hover:bg-gray-100 hover:text-gray-700"
                >
                  All categories
                </button>

                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.label}>
                    <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-300" />
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      disabled={index === breadcrumbs.length - 1}
                      className={cn(
                        "flex items-center rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                        index === breadcrumbs.length - 1
                          ? "cursor-default bg-gray-100 text-gray-900"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-800",
                      )}
                    >
                      {crumb.label}
                    </button>
                  </React.Fragment>
                ))}

                <button
                  type="button"
                  onClick={clearAllCategories}
                  className="ml-1 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Clear category filters"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <BrowseFiltersToolbar
              selectedLevel1={selectedLevel1}
              selectedLevel2={selectedLevel2}
              selectedLevel3={selectedLevel3}
              onLevel1Change={onLevel1Change}
              onLevel2Change={onLevel2Change}
              onLevel3Change={onLevel3Change}
              filters={browseFilters}
              onFiltersChange={onBrowseFiltersChange}
              onFiltersApply={onBrowseFiltersApply}
              productCount={productCount}
              gridLayout={productGridLayout}
              onGridLayoutChange={onProductGridLayoutChange}
              additionalFilters={additionalFilters ?? null}
              toolbarScrollRef={categoryPillsRef}
            />
          </div>

          {/* Mobile: category pills under tabs + filter sheet (opened from header FAB) */}
          <div className="space-y-2 pb-1.5 sm:hidden">
            <div className="px-3">
              <BrowseFiltersToolbar
                categoryPillsRowOnly
                selectedLevel1={selectedLevel1}
                selectedLevel2={selectedLevel2}
                selectedLevel3={selectedLevel3}
                onLevel1Change={onLevel1Change}
                onLevel2Change={onLevel2Change}
                onLevel3Change={onLevel3Change}
                filters={browseFilters}
                onFiltersChange={onBrowseFiltersChange}
                onFiltersApply={onBrowseFiltersApply}
                gridLayout={productGridLayout}
                onGridLayoutChange={onProductGridLayoutChange}
                toolbarScrollRef={categoryPillsRef}
              />
            </div>

            <Sheet open={browseSheetOpen} onOpenChange={setBrowseSheetOpen}>
              <SheetContent
                side="right"
                className="w-[50vw] min-w-[280px] max-w-[400px] gap-0 border-0 p-0 h-full flex flex-col"
                showCloseButton={false}
              >
                <MobileFilterContent
                  filters={browseFilters}
                  onFiltersChange={onBrowseFiltersChange}
                  onApply={() => {
                    onBrowseFiltersApply();
                    setBrowseSheetOpen(false);
                  }}
                  onReset={onBrowseFiltersReset}
                  activeFilterCount={mobileBrowseAdvancedCount}
                  listingTypeFilter={listingTypeFilter}
                  onListingTypeChange={onListingTypeChange}
                  onClose={() => setBrowseSheetOpen(false)}
                  topSection={
                    <div className="space-y-4 border-b border-gray-100 pb-4">
                      {breadcrumbs.length > 0 && (
                        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                          <button
                            type="button"
                            onClick={clearAllCategories}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors whitespace-nowrap hover:bg-gray-100 hover:text-gray-700"
                          >
                            All categories
                          </button>
                          {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={crumb.label}>
                              <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-300" />
                              <button
                                type="button"
                                onClick={crumb.onClick}
                                disabled={index === breadcrumbs.length - 1}
                                className={cn(
                                  "flex items-center rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                                  index === breadcrumbs.length - 1
                                    ? "cursor-default bg-gray-100 text-gray-900"
                                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-800",
                                )}
                              >
                                {crumb.label}
                              </button>
                            </React.Fragment>
                          ))}
                          <button
                            type="button"
                            onClick={clearAllCategories}
                            className="ml-1 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            aria-label="Clear category filters"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <BrowseFiltersToolbar
                        sheetMode
                        hideCategoryPills
                        selectedLevel1={selectedLevel1}
                        selectedLevel2={selectedLevel2}
                        selectedLevel3={selectedLevel3}
                        onLevel1Change={onLevel1Change}
                        onLevel2Change={onLevel2Change}
                        onLevel3Change={onLevel3Change}
                        filters={browseFilters}
                        onFiltersChange={onBrowseFiltersChange}
                        onFiltersApply={onBrowseFiltersApply}
                        gridLayout={productGridLayout}
                        onGridLayoutChange={onProductGridLayoutChange}
                      />
                    </div>
                  }
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
