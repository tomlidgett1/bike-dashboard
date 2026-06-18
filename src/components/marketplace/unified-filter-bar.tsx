"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, X } from '@/components/layout/app-sidebar/dashboard-icons';
import { SolarProvider, MagicStick3, Bag, Shop } from "@solar-icons/react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { BikeStoresPicker } from "@/components/marketplace/bike-stores-picker";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import { UBER_GREEN } from "@/lib/uber-brand-colors";

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
  /** Switch to the For You space in place. Falls back to marketplace route nav. */
  onNavigateToForYou?: () => void;
  /** Predictively warm a space's data on press-in / hover (before the click resolves). */
  onPrefetchSpace?: (space: MarketplaceSpace) => void;

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
  /** Product search active — hide category browse rows (pills, breadcrumbs). */
  suppressCategoryBrowse?: boolean;
}

function UberLogo({ active, className }: { active?: boolean; className?: string }) {
  return (
    <Image
      src={active ? "/uberwhite.png" : "/uber.png"}
      alt="Uber"
      width={52}
      height={18}
      className={cn("h-4 w-auto max-w-none", className)}
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
  onNavigateToForYou,
  onPrefetchSpace,
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
  suppressCategoryBrowse = false,
}: UnifiedFilterBarProps) {
  // Mobile browse filter sheet (controlled from parent FAB or internal)
  const [uncontrolledBrowseOpen, setUncontrolledBrowseOpen] = React.useState(false);
  const browseSheetControlled =
    mobileBrowseSheetOpen !== undefined && onMobileBrowseSheetOpenChange !== undefined;
  const browseSheetOpen = browseSheetControlled ? mobileBrowseSheetOpen! : uncontrolledBrowseOpen;
  const setBrowseSheetOpen = browseSheetControlled
    ? onMobileBrowseSheetOpenChange!
    : setUncontrolledBrowseOpen;

  const router = useRouter();

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
  const isForYouActive = optimisticTab ? optimisticTab === "for-you" : currentSpace === "for-you";

  // In-place space switch when the marketplace owns the For You space; otherwise
  // navigate to the marketplace For You tab.
  const goForYou = () => {
    if (onNavigateToForYou) {
      setOptimisticTab("for-you");
      onNavigateToForYou();
    } else {
      router.push("/marketplace?space=for-you");
    }
  };

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
  const isForYouMode = currentSpace === "for-you";
  // Show browse filters for Marketplace / Stores / Uber — not on For You
  const showBrowseChrome = isOnBrowseMode && !isForYouMode;
  const activeFilterCount = countActiveFilters(browseFilters);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ════════════════════════════════════════
          ROW 1 — space tabs.
          Category pills are NOT here; they live in Row 2.
          Advanced filters open from the floating FAB (MarketplaceHeader),
          so no inline filter control is needed here.
          BikeStoresPicker only shown on Bike Stores tab.
          ════════════════════════════════════════ */}

      {/* Mobile — segmented control. Solar icons on For You / Browse / Stores; Uber keeps wordmark. */}
      <div className="sm:hidden px-3 pt-2 pb-1">
        <SolarProvider value={{ weight: "Linear", color: "currentColor" }} svgProps={{ strokeWidth: 2 }}>
          <div className="grid grid-cols-4 gap-0.5 rounded-full bg-gray-100 p-0.5">
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("for-you")}
              onClick={goForYou}
              className={cn(
                "flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-full px-1 text-[12px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isForYouActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
              )}
            >
              <MagicStick3 className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">For You</span>
            </button>
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("marketplace")}
              onClick={() => { setOptimisticTab("marketplace"); onViewModeChange("all"); }}
              className={cn(
                "flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-full px-1 text-[12px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isBrowseActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
              )}
            >
              <Bag className="h-3.5 w-3.5 flex-shrink-0" />
              {/* "Browse" (not "Marketplace") so four tabs fit on small screens */}
              <span className="truncate">Browse</span>
            </button>
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("stores")}
              onClick={() => { setOptimisticTab("stores"); onNavigateToStores?.(); }}
              className={cn(
                "flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-full px-1 text-[12px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isStoresActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
              )}
            >
              <Shop className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Stores</span>
            </button>
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("uber")}
              onClick={() => { setOptimisticTab("uber"); onNavigateToUber?.(); }}
              className={cn(
                "flex h-8 min-w-0 cursor-pointer items-center justify-center rounded-full px-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isUberActive ? "shadow-sm" : "",
              )}
              style={isUberActive ? { backgroundColor: UBER_GREEN } : undefined}
              aria-label="Uber delivery"
            >
              <UberLogo active={isUberActive} />
            </button>
          </div>
        </SolarProvider>
      </div>

      {/* Desktop — filters always visible, no toggle button */}
      <div className="hidden sm:flex items-center gap-4">
        <SolarProvider value={{ weight: "Linear", color: "currentColor" }} svgProps={{ strokeWidth: 2 }}>
          <div className="h-11 rounded-full bg-white border border-gray-200 shadow-sm p-1 inline-flex flex-shrink-0">
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("for-you")}
              onClick={goForYou}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isForYouActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700",
              )}
            >
              <MagicStick3 className="h-4 w-4 flex-shrink-0" />
              For You
            </button>
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("marketplace")}
              onClick={() => { setOptimisticTab("marketplace"); onViewModeChange("all"); }}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isBrowseActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700",
              )}
            >
              <Bag className="h-4 w-4 flex-shrink-0" />
              Marketplace
            </button>
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("stores")}
              onClick={() => { setOptimisticTab("stores"); onNavigateToStores?.(); }}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isStoresActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700",
              )}
            >
              <Shop className="h-4 w-4 flex-shrink-0" />
              Bike Stores
            </button>
            <button
              type="button"
              onPointerDown={() => onPrefetchSpace?.("uber")}
              onClick={() => { setOptimisticTab("uber"); onNavigateToUber?.(); }}
              className={cn(
                "flex h-9 min-w-16 cursor-pointer items-center justify-center rounded-full px-2 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                isUberActive ? "text-white shadow-[0_0_10px_rgba(17,24,39,0.16)]" : "text-gray-500 hover:text-gray-700",
              )}
              style={isUberActive ? { backgroundColor: UBER_GREEN } : undefined}
              aria-label="Uber delivery"
            >
              <UberLogo active={isUberActive} className="h-3.5" />
            </button>
          </div>
        </SolarProvider>

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

      {/* Desktop: category breadcrumbs sit centred between row 1 and pills */}
      {showBrowseChrome && !suppressCategoryBrowse && breadcrumbs.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 overflow-x-auto scrollbar-hide">
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

      {/* Desktop: category pills */}
      {showBrowseChrome && !suppressCategoryBrowse && (
        <div className="hidden sm:block">
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

      {/* Mobile: store picker (Stores tab only) + category pills on one compact row.
          The picker is pinned left; the pills scroll beside it.
          The advanced-filter sheet opens from the header's floating FAB. */}
      {showBrowseChrome && !suppressCategoryBrowse && (
        <div className="sm:hidden">
          <div className="flex items-center gap-2 px-3 pb-2">
            {onStoreSelect && isStoresMode && (
              <BikeStoresPicker
                selectedStoreId={selectedStoreId}
                onStoreSelect={onStoreSelect}
                onAllStores={onNavigateToStores}
                className="shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
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
          </div>

          <Sheet open={browseSheetOpen} onOpenChange={setBrowseSheetOpen}>
            <SheetContent
              side="right"
              className="data-[side=right]:w-[90vw] min-w-[300px] max-w-[380px] gap-0 border-0 p-0 h-full flex flex-col"
              showCloseButton={false}
            >
              <SheetTitle className="sr-only">Filters</SheetTitle>
              <MobileFilterContent
                filters={browseFilters}
                onFiltersChange={onBrowseFiltersChange}
                onApply={() => { onBrowseFiltersApply(); setBrowseSheetOpen(false); }}
                onReset={onBrowseFiltersReset}
                activeFilterCount={activeFilterCount}
                productCount={productCount}
                sheetOpen={browseSheetOpen}
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
