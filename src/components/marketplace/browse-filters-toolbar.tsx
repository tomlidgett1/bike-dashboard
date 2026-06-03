"use client";

import * as React from "react";
import { MapPin, Grid2x2, Grid3x2, Grid3X3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BikeIcon, getCategoryIconName } from "@/components/ui/bike-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AdvancedFiltersState,
  type ConditionFilter,
  type SortOption,
} from "@/components/marketplace/advanced-filters";
import { preload } from "swr";
import { BRAND_YELLOW } from "@/lib/constants/brand-colors";

/** A single top-level category pill entry. */
export interface DynamicCategory { label: string; level1: string }

// Skeleton pills — varied widths for a natural staggered look
const SKELETON_WIDTHS = [88, 120, 100, 136, 96, 108];

function CategoryPillsSkeleton() {
  return (
    <>
      {SKELETON_WIDTHS.map((w, i) => (
        <div
          key={i}
          className="h-8 sm:h-10 flex-shrink-0 rounded-full bg-gray-200 animate-pulse"
          style={{ width: w }}
        />
      ))}
    </>
  );
}

const LOCATION_OPTIONS = [{ value: "melbourne", label: "Melbourne" }] as const;

const CONDITION_ITEMS: { value: ConditionFilter; label: string }[] = [
  { value: "all",       label: "Condition" },
  { value: "New",       label: "New" },
  { value: "Like New",  label: "Like New" },
  { value: "Excellent", label: "Excellent" },
  { value: "Good",      label: "Good" },
  { value: "Fair",      label: "Fair" },
  { value: "Well Used", label: "Well Used" },
];

const SORT_ITEMS: { value: SortOption; label: string }[] = [
  { value: "newest",     label: "Newest" },
  { value: "oldest",     label: "Oldest" },
  { value: "price_asc",  label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

const PRICE_ITEMS: { value: string; label: string; min: string; max: string }[] = [
  { value: "any",   label: "Price",      min: "",     max: "" },
  { value: "p100",  label: "<$100",      min: "",     max: "100" },
  { value: "p500",  label: "$100–500",   min: "100",  max: "500" },
  { value: "p1k",   label: "$500–1k",    min: "500",  max: "1000" },
  { value: "p2500", label: "$1k–2.5k",   min: "1000", max: "2500" },
  { value: "p5k",   label: "$2.5k–5k",   min: "2500", max: "5000" },
  { value: "p5kp",  label: "$5k+",       min: "5000", max: "" },
];

function prefetchProducts(level1: string) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "50");
  params.set("level1", level1);
  preload(`/api/marketplace/products?${params}`, (url: string) =>
    fetch(url).then((res) => res.json())
  );
}

function priceValueFromFilters(f: AdvancedFiltersState): string {
  const { minPrice, maxPrice } = f;
  if (!minPrice && !maxPrice) return "any";
  const hit = PRICE_ITEMS.find(
    (p) => p.value !== "any" && p.min === minPrice && p.max === maxPrice
  );
  return hit?.value ?? "custom";
}

/** Trigger class for selects sitting inside the filter pill */
const pillTriggerClass =
  "h-full rounded-none border-0 shadow-none ring-0 bg-transparent text-sm text-gray-700 " +
  "gap-1.5 px-3.5 py-0 focus:ring-0 focus:outline-none focus-visible:ring-0 " +
  "data-[size=default]:h-full data-[size=sm]:h-full [&_svg]:shrink-0 " +
  "hover:bg-gray-50 whitespace-nowrap cursor-pointer";

function PillDivider() {
  return <div className="w-px bg-gray-100 my-2 flex-shrink-0" aria-hidden />;
}

export type ProductGridLayout = "grid4" | "grid6" | "grid8";

export interface BrowseFiltersToolbarProps {
  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onLevel1Change: (category: string | null) => void;
  onLevel2Change: (sub: string | null) => void;
  onLevel3Change: (sub: string | null) => void;
  filters: AdvancedFiltersState;
  onFiltersChange: (f: AdvancedFiltersState) => void;
  onFiltersApply: () => void;
  productCount?: number;
  gridLayout: ProductGridLayout;
  onGridLayoutChange: (layout: ProductGridLayout) => void;
  additionalFilters?: React.ReactNode;
  toolbarScrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Categories derived from the currently visible products. */
  dynamicCategories?: DynamicCategory[];
  /** True while the parent is still loading the first batch of products. */
  categoriesLoading?: boolean;
  /** Mobile sheet: categories + location + layout only */
  sheetMode?: boolean;
  /** Mobile browse: only the quick category pill row */
  categoryPillsRowOnly?: boolean;
  /** Omit the category pill row */
  hideCategoryPills?: boolean;
}

export function BrowseFiltersToolbar({
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onLevel1Change,
  onLevel2Change,
  onLevel3Change,
  filters,
  onFiltersChange,
  onFiltersApply,
  productCount,
  gridLayout,
  onGridLayoutChange,
  additionalFilters,
  toolbarScrollRef,
  dynamicCategories = [],
  categoriesLoading = false,
  sheetMode = false,
  categoryPillsRowOnly = false,
  hideCategoryPills = false,
}: BrowseFiltersToolbarProps) {
  const categories = dynamicCategories;

  const clearDrillDown = () => {
    onLevel2Change(null);
    onLevel3Change(null);
  };

  const handleCategoryClick = (level1: string) => {
    const activeTop =
      selectedLevel1 === level1 && !selectedLevel2 && !selectedLevel3;
    if (activeTop) {
      onLevel1Change(null);
      clearDrillDown();
      return;
    }
    onLevel1Change(level1);
    clearDrillDown();
    prefetchProducts(level1);
  };

  const priceSelectValue = priceValueFromFilters(filters);

  // ─── Mobile sheet mode ────────────────────────────────────────────────────
  if (sheetMode) {
    return (
      <div ref={toolbarScrollRef as React.RefObject<HTMLDivElement>} className="flex flex-col gap-4">
        {!hideCategoryPills && (
          <div className="flex flex-wrap gap-2">
            {categoriesLoading ? (
              <CategoryPillsSkeleton />
            ) : (
              categories.map(({ label, level1 }) => {
                const icon = getCategoryIconName(level1);
                const isActive = selectedLevel1 === level1 && !selectedLevel2 && !selectedLevel3;
                return (
                  <button key={level1} type="button" onClick={() => handleCategoryClick(level1)}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-2 rounded-full border-2 px-4 text-sm font-medium transition-colors cursor-pointer",
                      isActive ? "bg-white text-gray-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    )}
                    style={isActive ? ({ borderColor: BRAND_YELLOW } as React.CSSProperties) : undefined}
                  >
                    <BikeIcon iconName={icon} size={20} className="opacity-90" />
                    {label}
                  </button>
                );
              })
            )}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <Select defaultValue="melbourne">
            <SelectTrigger className="h-10 rounded-full border border-gray-200 bg-white text-sm text-gray-700 px-4 w-full">
              <MapPin className="h-4 w-4 text-gray-400" />
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              {LOCATION_OPTIONS.map((loc) => (
                <SelectItem key={loc.value} value={loc.value} className="rounded-md">{loc.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex h-10 items-stretch rounded-full border border-gray-200 bg-white overflow-hidden">
            <button type="button" aria-label="4 per row" onClick={() => onGridLayoutChange("grid4")}
              className={cn("flex flex-1 items-center justify-center transition-colors", gridLayout === "grid4" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600")}>
              <Grid2x2 className="h-4 w-4" />
            </button>
            <div className="w-px bg-gray-100 my-2" />
            <button type="button" aria-label="6 per row" onClick={() => onGridLayoutChange("grid6")}
              className={cn("flex flex-1 items-center justify-center transition-colors", gridLayout === "grid6" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600")}>
              <Grid3x2 className="h-4 w-4" />
            </button>
            <div className="w-px bg-gray-100 my-2" />
            <button type="button" aria-label="8 per row" onClick={() => onGridLayoutChange("grid8")}
              className={cn("flex flex-1 items-center justify-center transition-colors", gridLayout === "grid8" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600")}>
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Mobile / desktop category-pills-only row ────────────────────────────
  if (categoryPillsRowOnly) {
    return (
      // Fixed height (smaller on mobile) so the row never shifts between skeleton and real pills
      <div ref={toolbarScrollRef as React.RefObject<HTMLDivElement>}
        className="flex h-8 sm:h-10 min-w-0 items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
        {categoriesLoading ? (
          <CategoryPillsSkeleton />
        ) : (
          categories.map(({ label, level1 }) => {
            const icon = getCategoryIconName(level1);
            const isActive = selectedLevel1 === level1 && !selectedLevel2 && !selectedLevel3;
            return (
              <button key={level1} type="button" onClick={() => handleCategoryClick(level1)}
                onMouseEnter={() => prefetchProducts(level1)}
                className={cn(
                  "box-border flex h-8 sm:h-10 shrink-0 items-center gap-1.5 sm:gap-2 rounded-full border sm:border-2 px-3 sm:px-4 text-[13px] sm:text-sm font-medium transition-colors cursor-pointer",
                  isActive ? "bg-white text-gray-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                )}
                style={isActive ? ({ borderColor: BRAND_YELLOW } as React.CSSProperties) : undefined}
              >
                <BikeIcon iconName={icon} size={20} className="opacity-90 h-4 w-4 sm:h-5 sm:w-5" />
                {label}
              </button>
            );
          })
        )}
      </div>
    );
  }

  // ─── Desktop: categories left · filter pill right ─────────────────────────
  return (
    <div ref={toolbarScrollRef as React.RefObject<HTMLDivElement>}
      className="flex w-full items-center gap-3">

      {/* Category pills — left, takes remaining space; h-10 is fixed to prevent layout shift */}
      {!hideCategoryPills && (
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-hide">
          {categoriesLoading ? (
            <CategoryPillsSkeleton />
          ) : (
            categories.map(({ label, level1 }) => {
              const icon = getCategoryIconName(level1);
              const isActive = selectedLevel1 === level1 && !selectedLevel2 && !selectedLevel3;
              return (
                <button key={level1} type="button"
                  onClick={() => handleCategoryClick(level1)}
                  onMouseEnter={() => prefetchProducts(level1)}
                  className={cn(
                    "box-border flex h-10 min-h-10 shrink-0 items-center gap-2 rounded-full border-2 px-4 text-sm font-medium transition-colors cursor-pointer",
                    isActive ? "bg-white text-gray-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  )}
                  style={isActive ? ({ borderColor: BRAND_YELLOW } as React.CSSProperties) : undefined}
                >
                  <BikeIcon iconName={icon} size={20} className="opacity-90" />
                  {label}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Filter pill — far right */}
      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        <div className="flex h-11 items-stretch rounded-full border border-gray-200 bg-white shadow-sm overflow-hidden">

          {/* Location */}
          <Select defaultValue="melbourne">
            <SelectTrigger className={cn(pillTriggerClass, "min-w-[8.5rem]")}>
              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              {LOCATION_OPTIONS.map((loc) => (
                <SelectItem key={loc.value} value={loc.value} className="rounded-md">{loc.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PillDivider />

          {/* Condition */}
          <Select
            value={filters.condition}
            onValueChange={(v) => {
              onFiltersChange({ ...filters, condition: v as ConditionFilter });
              onFiltersApply();
            }}
          >
            <SelectTrigger className={cn(pillTriggerClass, "min-w-[7.5rem]")}>
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              {CONDITION_ITEMS.map((c) => (
                <SelectItem key={c.value} value={c.value} className="rounded-md">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PillDivider />

          {/* Price */}
          <Select
            value={priceSelectValue}
            onValueChange={(v) => {
              if (v === "custom") return;
              const row = PRICE_ITEMS.find((p) => p.value === v);
              if (!row || v === "any") {
                onFiltersChange({ ...filters, minPrice: "", maxPrice: "" });
              } else {
                onFiltersChange({ ...filters, minPrice: row.min, maxPrice: row.max });
              }
              onFiltersApply();
            }}
          >
            <SelectTrigger className={cn(pillTriggerClass, "min-w-[6.5rem]")}>
              <SelectValue placeholder="Price" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              <SelectItem value="any" className="rounded-md">All prices</SelectItem>
              {PRICE_ITEMS.filter((p) => p.value !== "any").map((p) => (
                <SelectItem key={p.value} value={p.value} className="rounded-md">{p.label}</SelectItem>
              ))}
              <SelectItem value="custom" disabled className="rounded-md">Custom range</SelectItem>
            </SelectContent>
          </Select>

          <PillDivider />

          {/* Sort */}
          <Select
            value={filters.sortBy}
            onValueChange={(v) => {
              onFiltersChange({ ...filters, sortBy: v as SortOption });
              onFiltersApply();
            }}
          >
            <SelectTrigger className={cn(pillTriggerClass, "min-w-[6rem]")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              {SORT_ITEMS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="rounded-md">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PillDivider />

          {/* Layout toggle */}
          <div className="flex items-center px-1.5 gap-0.5">
            <button type="button" aria-label="4 per row" onClick={() => onGridLayoutChange("grid4")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                gridLayout === "grid4" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600"
              )}>
              <Grid2x2 className="h-4 w-4" />
            </button>
            <button type="button" aria-label="6 per row" onClick={() => onGridLayoutChange("grid6")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                gridLayout === "grid6" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600"
              )}>
              <Grid3x2 className="h-4 w-4" />
            </button>
            <button type="button" aria-label="8 per row" onClick={() => onGridLayoutChange("grid8")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                gridLayout === "grid8" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600"
              )}>
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>

          {productCount !== undefined && (
            <>
              <PillDivider />
              <span className="flex items-center px-3.5 text-sm tabular-nums text-gray-400 whitespace-nowrap">
                {productCount.toLocaleString()}
              </span>
            </>
          )}
        </div>

        {/* Advanced filters — sits alongside the pill */}
        {additionalFilters}
      </div>
    </div>
  );
}
