"use client";

import * as React from "react";
import { MapPin, LayoutGrid, List } from "lucide-react";
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

/** Top-level pills: display label → API `level1` category name */
const QUICK_CATEGORIES = [
  { label: "Bikes", level1: "Bicycles" },
  { label: "Frames", level1: "Frames & Framesets" },
  { label: "Wheels", level1: "Wheels & Tyres" },
  { label: "Apparel", level1: "Apparel" },
] as const;

const LOCATION_OPTIONS = [{ value: "melbourne", label: "Melbourne" }] as const;

const CONDITION_ITEMS: { value: ConditionFilter; label: string }[] = [
  { value: "all", label: "Condition" },
  { value: "New", label: "New" },
  { value: "Like New", label: "Like New" },
  { value: "Excellent", label: "Excellent" },
  { value: "Good", label: "Good" },
  { value: "Fair", label: "Fair" },
  { value: "Well Used", label: "Well Used" },
];

const SORT_ITEMS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

const PRICE_ITEMS: { value: string; label: string; min: string; max: string }[] = [
  { value: "any", label: "Price", min: "", max: "" },
  { value: "p100", label: "<$100", min: "", max: "100" },
  { value: "p500", label: "$100–500", min: "100", max: "500" },
  { value: "p1k", label: "$500–1k", min: "500", max: "1000" },
  { value: "p2500", label: "$1k–2.5k", min: "1000", max: "2500" },
  { value: "p5k", label: "$2.5k–5k", min: "2500", max: "5000" },
  { value: "p5kp", label: "$5k+", min: "5000", max: "" },
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

/** Match category pill row height (h-10). Override Trigger size presets (h-8/h-9). */
const selectTriggerClass =
  "h-10 min-h-10 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 shadow-none min-w-[7.5rem] gap-1.5 px-3 py-0 data-[size=default]:h-10 data-[size=sm]:h-10 [&_svg]:shrink-0";

export type ProductGridLayout = "grid" | "list";

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
  /** Mobile sheet: categories + location + layout only (no duplicated sort/price/condition; advanced lives in same sheet). */
  sheetMode?: boolean;
  /** Mobile browse: only the quick category pill row (below tabs). */
  categoryPillsRowOnly?: boolean;
  /** When true, omit the category pill row (e.g. sheet top: location + layout only). */
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
  sheetMode = false,
  categoryPillsRowOnly = false,
  hideCategoryPills = false,
}: BrowseFiltersToolbarProps) {
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

  return (
    <div
      ref={toolbarScrollRef as React.RefObject<HTMLDivElement>}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2",
        sheetMode && "gap-4",
        categoryPillsRowOnly && "gap-0 sm:gap-3",
      )}
    >
      {!hideCategoryPills && (
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 scrollbar-hide sm:pb-0",
          sheetMode &&
            "flex-none w-full flex-wrap overflow-x-visible pb-0",
          categoryPillsRowOnly && "flex-none w-full pb-0",
        )}
      >
        {QUICK_CATEGORIES.map(({ label, level1 }) => {
          const icon = getCategoryIconName(level1);
          const isActive =
            selectedLevel1 === level1 && !selectedLevel2 && !selectedLevel3;
          return (
            <button
              key={level1}
              type="button"
              onClick={() => handleCategoryClick(level1)}
              onMouseEnter={() => prefetchProducts(level1)}
              className={cn(
                "box-border flex h-10 min-h-10 shrink-0 items-center gap-2 rounded-lg border-2 px-3.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-white text-gray-900"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              )}
              style={
                isActive
                  ? ({ borderColor: BRAND_YELLOW } as React.CSSProperties)
                  : undefined
              }
            >
              <BikeIcon iconName={icon} size={20} className="opacity-90" />
              {label}
            </button>
          );
        })}
      </div>
      )}

      {!categoryPillsRowOnly && (
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-2 sm:justify-end",
          sheetMode && "w-full flex-col items-stretch",
        )}
      >
        <Select value="melbourne">
          <SelectTrigger
            className={cn(
              selectTriggerClass,
              "min-w-[9.5rem]",
              sheetMode && "w-full min-w-0",
            )}
          >
            <MapPin className="h-4 w-4 shrink-0 text-gray-500" />
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent className="rounded-lg">
            {LOCATION_OPTIONS.map((loc) => (
              <SelectItem key={loc.value} value={loc.value} className="rounded-md">
                {loc.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!sheetMode && (
          <>
            <Select
              value={filters.condition}
              onValueChange={(v) => {
                onFiltersChange({
                  ...filters,
                  condition: v as ConditionFilter,
                });
                onFiltersApply();
              }}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="Condition" />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                {CONDITION_ITEMS.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="rounded-md">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={priceSelectValue}
              onValueChange={(v) => {
                if (v === "custom") return;
                const row = PRICE_ITEMS.find((p) => p.value === v);
                if (!row || v === "any") {
                  onFiltersChange({ ...filters, minPrice: "", maxPrice: "" });
                } else {
                  onFiltersChange({
                    ...filters,
                    minPrice: row.min,
                    maxPrice: row.max,
                  });
                }
                onFiltersApply();
              }}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="Price" />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="any" className="rounded-md">
                  All prices
                </SelectItem>
                {PRICE_ITEMS.filter((p) => p.value !== "any").map((p) => (
                  <SelectItem key={p.value} value={p.value} className="rounded-md">
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom" disabled className="rounded-md">
                  Custom range
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="hidden h-6 w-px bg-gray-200 sm:block" />

            <span className="hidden text-sm text-gray-500 sm:inline">Sort by</span>
            <Select
              value={filters.sortBy}
              onValueChange={(v) => {
                onFiltersChange({ ...filters, sortBy: v as SortOption });
                onFiltersApply();
              }}
            >
              <SelectTrigger className={cn(selectTriggerClass, "min-w-[6.5rem]")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                {SORT_ITEMS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="rounded-md">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="hidden h-6 w-px bg-gray-200 sm:block" />
          </>
        )}

        <div
          className={cn(
            "flex h-10 min-h-10 shrink-0 items-stretch gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 box-border",
            sheetMode && "w-full shrink",
          )}
          role="group"
          aria-label="Product layout"
        >
          <button
            type="button"
            aria-label="Grid layout"
            onClick={() => onGridLayoutChange("grid")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md px-2 transition-colors min-w-[2.25rem]",
              gridLayout === "grid" ? "text-[#ffde59]" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="List layout"
            onClick={() => onGridLayoutChange("list")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md px-2 transition-colors min-w-[2.25rem]",
              gridLayout === "list" ? "text-[#ffde59]" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {!sheetMode && additionalFilters}

        {!sheetMode && productCount !== undefined && (
          <span className="hidden text-sm font-medium tabular-nums text-gray-500 lg:inline">
            {productCount.toLocaleString()} items
          </span>
        )}
      </div>
      )}
    </div>
  );
}
