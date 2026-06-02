"use client";

import * as React from "react";
import { Package, ChevronRight, X, Store, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  BrowseFiltersToolbar,
  type ProductGridLayout,
  type DynamicCategory,
} from "@/components/marketplace/browse-filters-toolbar";
import {
  MobileFilterContent,
  countActiveFilters,
  type AdvancedFiltersState,
} from "@/components/marketplace/advanced-filters";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { BikeStoresPicker } from "@/components/marketplace/bike-stores-picker";
import type { MarketplaceSpace } from "@/lib/types/marketplace";

// ============================================================
// Unified Filter Bar — view tabs + filter toolbar on same row
// A "Filters" toggle button shows / hides the filter section.
// Both Marketplace and Bike Stores tabs expose the same filters.
// ============================================================

export type ViewMode = "trending" | "all";
export type ListingTypeFilter = "all" | "stores" | "individuals";

export type { ProductGridLayout };

interface UnifiedFilterBarProps {
  currentSpace: MarketplaceSpace;
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
  onNavigateToUber?: () => void;

  selectedStoreId?: string | null;
  onStoreSelect?: (storeId: string) => void;

  browseFilters: AdvancedFiltersState;
  onBrowseFiltersChange: (f: AdvancedFiltersState) => void;
  onBrowseFiltersApply: () => void;
  onBrowseFiltersReset: () => void;
  productGridLayout: ProductGridLayout;
  onProductGridLayoutChange: (layout: ProductGridLayout) => void;

  /** Categories derived from the currently visible products. */
  dynamicCategories?: DynamicCategory[];
  /** True while the parent is loading the first batch of products. */
  categoriesLoading?: boolean;
  /** Mobile Browse: filter sheet open state (FAB lives in MarketplaceHeader). */
  mobileBrowseSheetOpen?: boolean;
  onMobileBrowseSheetOpenChange?: (open: boolean) => void;
}

function UberLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/uber.png"
      alt="Uber"
      width={34}
      height={14}
      className={cn("h-3.5 w-auto", className)}
      unoptimized
    />
  );
}

export function UnifiedFilterBar({
  currentSpace,
  viewMode,
  onViewModeChange,
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onLevel1Change,
  onLevel2Change,
  onNavigateToStores,
  onNavigateToUber,
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
  dynamicCategories,
  categoriesLoading,
  mobileBrowseSheetOpen,
  onMobileBrowseSheetOpenChange,
}: UnifiedFilterBarProps) {
  // Mobile browse filter sheet (controlled from parent FAB or internal)
  const [uncontrolledBrowseOpen, setUncontrolledBrowseOpen] = React.useState(false);
  const browseSheetControlled =
    mobileBrowseSheetOpen !== undefined && onMobileBrowseSheetOpenChange !== undefined;
  const browseSheetOpen = browseSheetControlled ? mobileBrowseSheetOpen! : uncontrolledBrowseOpen;
  const setBrowseSheetOpen = browseSheetControlled
    ? onMobileBrowseSheetOpenChange!
    : setUncontrolledBrowseOpen;

  // Filter panel visibility — mobile only (desktop always shows filters)
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const isStoresMode = currentSpace === "stores";
  const isUberMode = currentSpace === "uber";

  // Optimistic tab — updates in the same microtask as the click
  const [optimisticTab, setOptimisticTab] = React.useState<MarketplaceSpace | null>(null);
  React.useEffect(() => {
    setOptimisticTab(null);
  }, [currentSpace, viewMode, listingTypeFilter]);

  const isBrowseActive = optimisticTab ? optimisticTab === "marketplace" : currentSpace === "marketplace";
  const isStoresActive = optimisticTab ? optimisticTab === "stores" : isStoresMode;
  const isUberActive = optimisticTab ? optimisticTab === "uber" : isUberMode;

  const clearAllCategories = () => {
    onLevel1Change(null);
    onLevel2Change(null);
    onLevel3Change(null);
  };

  const breadcrumbs: { label: string; onClick: () => void }[] = [];
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
    breadcrumbs.push({ label: selectedLevel2, onClick: () => onLevel3Change(null) });
  }
  if (selectedLevel3) {
    breadcrumbs.push({ label: selectedLevel3, onClick: () => {} });
  }

  const isOnBrowseMode = viewMode === "all";
  // Show the filter section for both Marketplace and Bike Stores tabs
  const showBrowseChrome = isOnBrowseMode;
  const activeFilterCount = countActiveFilters(browseFilters);

  // Shared filter toggle button styles
  const filterToggleClass = (open: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-full border font-medium transition-colors whitespace-nowrap focus:outline-none",
      open
        ? "bg-gray-900 text-white border-gray-900"
        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-800",
    );

  return (
    <div className="space-y-2">
      {/* ════════════════════════════════════════
          ROW 1 — tabs · filter controls · [Filters/Hide] far-right
          Category pills are NOT here; they live in Row 2.
          BikeStoresPicker only shown on Bike Stores tab.
          ════════════════════════════════════════ */}

      {/* Mobile */}
      <div className="flex items-center gap-2 sm:hidden pt-1 pb-0.5 pr-3">
        <div className="mx-3 min-w-0 flex-1 h-12 rounded-full bg-white border border-gray-200 shadow-sm p-1 grid grid-cols-3">
          <button
            type="button"
            onClick={() => { setOptimisticTab("marketplace"); onViewModeChange("all"); }}
            className={cn(
              "flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              isBrowseActive ? "bg-gray-100 text-gray-900" : "text-gray-500",
            )}
          >
            <Package className="h-4 w-4 flex-shrink-0" />
            <span>Marketplace</span>
          </button>
          <button
            type="button"
            onClick={() => { setOptimisticTab("stores"); onNavigateToStores?.(); }}
            className={cn(
              "flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              isStoresActive ? "bg-gray-100 text-gray-900" : "text-gray-500",
            )}
          >
            <Store className="h-4 w-4 flex-shrink-0" />
            <span>Stores</span>
          </button>
          <button
            type="button"
            onClick={() => { setOptimisticTab("uber"); onNavigateToUber?.(); }}
            className={cn(
              "flex h-10 min-w-0 cursor-pointer items-center justify-center rounded-full px-2 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              isUberActive ? "bg-gray-100 text-gray-900" : "text-gray-500",
            )}
            aria-label="Uber delivery"
          >
            <UberLogo />
          </button>
        </div>

        {/* Stores-only picker */}
        {onStoreSelect && isStoresMode && (
          <BikeStoresPicker
            selectedStoreId={selectedStoreId}
            onStoreSelect={onStoreSelect}
            onAllStores={onNavigateToStores}
            className="shrink-0"
          />
        )}

        {/* Filter toggle — mobile only, far right */}
        {showBrowseChrome && (
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-label="Toggle filters"
            className={cn(filterToggleClass(filtersOpen), "flex-shrink-0 h-10 px-3 text-sm")}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold px-1">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Desktop — filters always visible, no toggle button */}
      <div className="hidden sm:flex items-center gap-3">
        <div className="h-11 grid-cols-3 rounded-full bg-white border border-gray-200 shadow-sm p-1 grid flex-shrink-0">
          <button
            type="button"
            onClick={() => { setOptimisticTab("marketplace"); onViewModeChange("all"); }}
            className={cn(
              "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              isBrowseActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700",
            )}
          >
            <Package className="h-4 w-4" />
            Marketplace
          </button>
          <button
            type="button"
            onClick={() => { setOptimisticTab("stores"); onNavigateToStores?.(); }}
            className={cn(
              "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              isStoresActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700",
            )}
          >
            <Store className="h-4 w-4" />
            Bike Stores
          </button>
          <button
            type="button"
            onClick={() => { setOptimisticTab("uber"); onNavigateToUber?.(); }}
            className={cn(
              "flex h-9 cursor-pointer items-center justify-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              isUberActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700",
            )}
            aria-label="Uber delivery"
          >
            <UberLogo />
          </button>
        </div>

        {/* Stores-only picker */}
        {onStoreSelect && isStoresMode && (
          <BikeStoresPicker
            selectedStoreId={selectedStoreId}
            onStoreSelect={onStoreSelect}
            onAllStores={onNavigateToStores}
          />
        )}

        {/* Filter controls inline (no pills, no extra dropdown) — always shown on desktop */}
        {showBrowseChrome && (
          <BrowseFiltersToolbar
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
            productCount={productCount}
            gridLayout={productGridLayout}
            onGridLayoutChange={onProductGridLayoutChange}
          />
        )}
      </div>

      {/* ════════════════════════════════════════
          ROW 2 — category pills (always on desktop, collapsible on mobile)
          ════════════════════════════════════════ */}

      {/* Desktop: always shown */}
      {showBrowseChrome && (
        <div className="hidden sm:block">
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide mb-2">
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
            dynamicCategories={dynamicCategories}
            categoriesLoading={categoriesLoading}
          />
        </div>
      )}

      {/* Mobile: category pills row + filter sheet */}
      {showBrowseChrome && filtersOpen && (
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
              dynamicCategories={dynamicCategories}
              categoriesLoading={categoriesLoading}
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
                onApply={() => { onBrowseFiltersApply(); setBrowseSheetOpen(false); }}
                onReset={onBrowseFiltersReset}
                activeFilterCount={activeFilterCount}
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
      )}
    </div>
  );
}
