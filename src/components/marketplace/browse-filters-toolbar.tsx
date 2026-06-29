"use client";

import * as React from "react";
import {
  SolarProvider,
  MapPoint,
  SortVertical,
  Widget2,
  Widget3,
  Widget4,
  Tag,
  Dollar,
} from "@solar-icons/react";
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
import { CategorySectionsNav } from "@/components/marketplace/category-sections-nav";
import type { DynamicCategory } from "@/lib/constants/category-sections";

export type { DynamicCategory };

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

function CategoryPillsRow({
  categories,
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onCategoryClick,
  onCategoryHover,
  loading,
  variant = "scroll",
}: {
  categories: DynamicCategory[];
  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onCategoryClick: (level1: string) => void;
  onCategoryHover?: (level1: string) => void;
  loading?: boolean;
  variant?: "scroll" | "wrap";
}) {
  if (loading) {
    return variant === "wrap" ? (
      <div className="flex flex-wrap gap-2">
        <CategoryPillsSkeleton />
      </div>
    ) : (
      <div className="flex h-8 sm:h-10 min-w-0 items-center gap-2 sm:gap-2.5 overflow-x-auto scrollbar-hide">
        <CategoryPillsSkeleton />
      </div>
    );
  }

  const pills = categories.map(({ label, level1 }) => {
    const icon = getCategoryIconName(level1);
    const isActive = selectedLevel1 === level1 && !selectedLevel2 && !selectedLevel3;
    return (
      <button
        key={level1}
        type="button"
        onClick={() => onCategoryClick(level1)}
        onMouseEnter={() => onCategoryHover?.(level1)}
        className={cn(
          variant === "wrap"
            ? "flex h-10 shrink-0 items-center gap-2 rounded-full border-2 px-4 text-sm font-medium transition-colors cursor-pointer"
            : "box-border flex h-8 sm:h-10 shrink-0 items-center gap-1.5 sm:gap-2 rounded-full border sm:border-2 px-3 sm:px-4 text-[13px] sm:text-sm font-medium transition-colors cursor-pointer",
          isActive ? "bg-white text-gray-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
        )}
        style={isActive ? ({ borderColor: BRAND_YELLOW } as React.CSSProperties) : undefined}
      >
        <BikeIcon
          iconName={icon}
          size={20}
          className={cn("opacity-90", variant === "wrap" ? "" : "h-4 w-4 sm:h-5 sm:w-5")}
        />
        {label}
      </button>
    );
  });

  if (variant === "wrap") {
    return <div className="flex flex-wrap gap-2">{pills}</div>;
  }

  return (
    <div className="flex h-8 sm:h-10 min-w-0 items-center gap-2 sm:gap-2.5 overflow-x-auto scrollbar-hide">
      {pills}
    </div>
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

export const BROWSE_SORT_ITEMS: { value: SortOption; label: string }[] = [
  { value: "newest",     label: "Newest" },
  { value: "oldest",     label: "Oldest" },
  { value: "price_asc",  label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

const SORT_ITEMS = BROWSE_SORT_ITEMS;

/** Trigger class for selects sitting inside the filter pill */
const pillTriggerClass =
  "h-full rounded-none border-0 shadow-none ring-0 bg-transparent text-sm text-gray-700 " +
  "gap-1.5 px-3.5 py-0 focus:ring-0 focus:outline-none focus-visible:ring-0 " +
  "data-[size=default]:h-full data-[size=sm]:h-full [&_svg]:shrink-0 " +
  "hover:bg-gray-50 whitespace-nowrap cursor-pointer";

/** Flat text triggers for the desktop nav bar — no pill / button chrome */
const navTriggerClass =
  "h-10 w-auto min-w-0 gap-1.5 border-0 bg-transparent px-0 py-0 text-sm font-medium leading-none text-gray-600 shadow-none ring-0 " +
  "transition-colors hover:text-gray-900 focus:ring-0 focus:outline-none focus-visible:ring-0 " +
  "data-[size=default]:h-10 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 [&_svg]:text-gray-400 " +
  "whitespace-nowrap cursor-pointer";

function NavFilterSeparator() {
  return <span className="h-3 w-px shrink-0 bg-gray-200" aria-hidden />;
}

export { NavFilterSeparator };

const filterSelectContentClass =
  "max-h-[min(60vh,22rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 text-gray-900 shadow-lg ring-0 min-w-[var(--radix-select-trigger-width)]";

const filterSelectItemClass =
  "cursor-pointer rounded-md text-gray-900 focus:bg-gray-100 focus:text-gray-900 data-[state=checked]:bg-gray-100 data-[state=checked]:text-gray-900";

function FilterSelectContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SelectContent
      position="popper"
      align="start"
      side="bottom"
      sideOffset={6}
      collisionPadding={12}
      className={cn(filterSelectContentClass, className)}
    >
      {children}
    </SelectContent>
  );
}

const solarProviderProps = {
  value: { weight: "Linear" as const, color: "currentColor" },
  svgProps: { strokeWidth: 2 },
};

export function BrowseSortButton({
  sortBy,
  onSortChange,
  onApply,
  className,
  variant = "icon",
}: {
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  onApply?: () => void;
  className?: string;
  variant?: "icon" | "pill" | "text";
}) {
  const sortLabel = SORT_ITEMS.find((s) => s.value === sortBy)?.label ?? "Newest";
  const isActive = sortBy !== "newest";

  return (
    <Select
      value={sortBy}
      onValueChange={(v) => {
        onSortChange(v as SortOption);
        onApply?.();
      }}
    >
      <SelectTrigger
        aria-label={`Sort: ${sortLabel}`}
        className={cn(
          variant === "pill"
            ? cn(
                pillTriggerClass,
                "min-w-[7rem]",
                isActive ? "text-gray-900" : "text-gray-700"
              )
            : variant === "text"
              ? cn(navTriggerClass, isActive && "text-gray-900")
            : cn(
                "flex h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white p-0 shadow-none ring-0 transition-colors cursor-pointer [&>svg:last-child]:hidden",
                isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
              ),
          className
        )}
      >
        {variant === "pill" ? (
          <>
            <SortVertical className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <SelectValue />
          </>
        ) : variant === "text" ? (
          <>
            <SortVertical className="h-3.5 w-3.5 flex-shrink-0" />
            <SelectValue />
          </>
        ) : (
          <>
            <SortVertical className="h-4 w-4" />
            <SelectValue className="sr-only" />
          </>
        )}
      </SelectTrigger>
      <FilterSelectContent>
        {SORT_ITEMS.map((s) => (
          <SelectItem key={s.value} value={s.value} className={filterSelectItemClass}>
            {s.label}
          </SelectItem>
        ))}
      </FilterSelectContent>
    </Select>
  );
}

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

function PillDivider() {
  return <div className="w-px bg-gray-100 my-1.5 flex-shrink-0 self-stretch" aria-hidden />;
}

export interface BrowseFilterControlsProps {
  filters: AdvancedFiltersState;
  onFiltersChange: (f: AdvancedFiltersState) => void;
  onFiltersApply: () => void;
  gridLayout: ProductGridLayout;
  onGridLayoutChange: (layout: ProductGridLayout) => void;
  productCount?: number;
  additionalFilters?: React.ReactNode;
  className?: string;
  /** Compact styling for the desktop nav bar beside space tabs. */
  variant?: "default" | "nav";
}

export function BrowseFilterControls({
  filters,
  onFiltersChange,
  onFiltersApply,
  gridLayout,
  onGridLayoutChange,
  productCount,
  additionalFilters,
  className,
  variant = "default",
}: BrowseFilterControlsProps) {
  const priceSelectValue = priceValueFromFilters(filters);

  if (variant === "nav") {
    return (
      <div className={cn("flex h-10 items-center gap-3 flex-shrink-0", className)}>
        <SolarProvider {...solarProviderProps}>
          <div className="flex h-10 items-center gap-3">
          <Select defaultValue="melbourne">
            <SelectTrigger className={navTriggerClass}>
              <MapPoint className="h-3.5 w-3.5 flex-shrink-0" />
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <FilterSelectContent>
              {LOCATION_OPTIONS.map((loc) => (
                <SelectItem key={loc.value} value={loc.value} className={filterSelectItemClass}>
                  {loc.label}
                </SelectItem>
              ))}
            </FilterSelectContent>
          </Select>

          <NavFilterSeparator />

          <Select
            value={filters.condition}
            onValueChange={(v) => {
              onFiltersChange({ ...filters, condition: v as ConditionFilter });
              onFiltersApply();
            }}
          >
            <SelectTrigger className={navTriggerClass}>
              <Tag className="h-3.5 w-3.5 flex-shrink-0" />
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <FilterSelectContent>
              {CONDITION_ITEMS.map((c) => (
                <SelectItem key={c.value} value={c.value} className={filterSelectItemClass}>
                  {c.label}
                </SelectItem>
              ))}
            </FilterSelectContent>
          </Select>

          <NavFilterSeparator />

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
            <SelectTrigger className={navTriggerClass}>
              <Dollar className="h-3.5 w-3.5 flex-shrink-0" />
              <SelectValue placeholder="Price" />
            </SelectTrigger>
            <FilterSelectContent>
              <SelectItem value="any" className={filterSelectItemClass}>
                All prices
              </SelectItem>
              {PRICE_ITEMS.filter((p) => p.value !== "any").map((p) => (
                <SelectItem key={p.value} value={p.value} className={filterSelectItemClass}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="custom" disabled className={filterSelectItemClass}>
                Custom range
              </SelectItem>
            </FilterSelectContent>
          </Select>

          <NavFilterSeparator />

          <BrowseSortButton
            variant="text"
            sortBy={filters.sortBy}
            onSortChange={(sortBy) => onFiltersChange({ ...filters, sortBy })}
            onApply={onFiltersApply}
          />
          </div>
        </SolarProvider>

        <NavFilterSeparator />

        <div className="flex h-10 items-center gap-1">
          <button
            type="button"
            aria-label="4 per row"
            onClick={() => onGridLayoutChange("grid4")}
            className={cn(
              "flex h-10 w-7 items-center justify-center transition-colors",
              gridLayout === "grid4" ? "text-gray-900" : "text-gray-400 hover:text-gray-600",
            )}
          >
            <Widget2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="6 per row"
            onClick={() => onGridLayoutChange("grid6")}
            className={cn(
              "flex h-10 w-7 items-center justify-center transition-colors",
              gridLayout === "grid6" ? "text-gray-900" : "text-gray-400 hover:text-gray-600",
            )}
          >
            <Widget4 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="8 per row"
            onClick={() => onGridLayoutChange("grid8")}
            className={cn(
              "flex h-10 w-7 items-center justify-center transition-colors",
              gridLayout === "grid8" ? "text-gray-900" : "text-gray-400 hover:text-gray-600",
            )}
          >
            <Widget3 className="h-3.5 w-3.5" />
          </button>
        </div>

        {additionalFilters}
      </div>
    );
  }

  const barHeight = "h-11";
  const triggerClass = pillTriggerClass;

  return (
    <div className={cn("flex items-center gap-2 flex-shrink-0", className)}>
      <SolarProvider {...solarProviderProps}>
        <div
          className={cn(
            "flex items-stretch overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm",
            barHeight,
          )}
        >
          <Select defaultValue="melbourne">
            <SelectTrigger className={cn(triggerClass, "min-w-[8.5rem]")}>
              <MapPoint className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <FilterSelectContent>
              {LOCATION_OPTIONS.map((loc) => (
                <SelectItem key={loc.value} value={loc.value} className={filterSelectItemClass}>
                  {loc.label}
                </SelectItem>
              ))}
            </FilterSelectContent>
          </Select>

          <PillDivider />

          <Select
            value={filters.condition}
            onValueChange={(v) => {
              onFiltersChange({ ...filters, condition: v as ConditionFilter });
              onFiltersApply();
            }}
          >
            <SelectTrigger className={cn(triggerClass, "min-w-[7.5rem]")}>
              <Tag className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <FilterSelectContent>
              {CONDITION_ITEMS.map((c) => (
                <SelectItem key={c.value} value={c.value} className={filterSelectItemClass}>
                  {c.label}
                </SelectItem>
              ))}
            </FilterSelectContent>
          </Select>

          <PillDivider />

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
            <SelectTrigger className={cn(triggerClass, "min-w-[6.5rem]")}>
              <Dollar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <SelectValue placeholder="Price" />
            </SelectTrigger>
            <FilterSelectContent>
              <SelectItem value="any" className={filterSelectItemClass}>
                All prices
              </SelectItem>
              {PRICE_ITEMS.filter((p) => p.value !== "any").map((p) => (
                <SelectItem key={p.value} value={p.value} className={filterSelectItemClass}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="custom" disabled className={filterSelectItemClass}>
                Custom range
              </SelectItem>
            </FilterSelectContent>
          </Select>

          <PillDivider />

          <BrowseSortButton
            variant="pill"
            sortBy={filters.sortBy}
            onSortChange={(sortBy) => onFiltersChange({ ...filters, sortBy })}
            onApply={onFiltersApply}
          />

          <PillDivider />

          <div className="flex items-center gap-0.5 px-1.5">
                <button
                  type="button"
                  aria-label="4 per row"
                  onClick={() => onGridLayoutChange("grid4")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    gridLayout === "grid4" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  <Widget2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="6 per row"
                  onClick={() => onGridLayoutChange("grid6")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    gridLayout === "grid6" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  <Widget4 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="8 per row"
                  onClick={() => onGridLayoutChange("grid8")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    gridLayout === "grid8" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600",
                  )}
                >
                <Widget3 className="h-4 w-4" />
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
      </SolarProvider>

      {additionalFilters}
    </div>
  );
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

  // ─── Mobile sheet mode ────────────────────────────────────────────────────
  if (sheetMode) {
    return (
      <div ref={toolbarScrollRef as React.RefObject<HTMLDivElement>} className="flex flex-col gap-4">
        {!hideCategoryPills && (
          <CategoryPillsRow
            categories={categories}
            selectedLevel1={selectedLevel1}
            selectedLevel2={selectedLevel2}
            selectedLevel3={selectedLevel3}
            onCategoryClick={handleCategoryClick}
            loading={categoriesLoading}
            variant="wrap"
          />
        )}
        <div className="flex flex-col gap-3">
          <SolarProvider {...solarProviderProps}>
            <Select defaultValue="melbourne">
              <SelectTrigger className="h-10 rounded-full border border-gray-200 bg-white text-sm text-gray-700 px-4 w-full">
                <MapPoint className="h-4 w-4 text-gray-400" />
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <FilterSelectContent>
                {LOCATION_OPTIONS.map((loc) => (
                  <SelectItem key={loc.value} value={loc.value} className={filterSelectItemClass}>{loc.label}</SelectItem>
                ))}
              </FilterSelectContent>
            </Select>
            <div className="flex h-10 items-stretch rounded-full border border-gray-200 bg-white overflow-hidden">
              <button type="button" aria-label="4 per row" onClick={() => onGridLayoutChange("grid4")}
                className={cn("flex flex-1 items-center justify-center transition-colors", gridLayout === "grid4" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600")}>
                <Widget2 className="h-4 w-4" />
              </button>
              <div className="w-px bg-gray-100 my-2" />
              <button type="button" aria-label="6 per row" onClick={() => onGridLayoutChange("grid6")}
                className={cn("flex flex-1 items-center justify-center transition-colors", gridLayout === "grid6" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600")}>
                <Widget4 className="h-4 w-4" />
              </button>
              <div className="w-px bg-gray-100 my-2" />
              <button type="button" aria-label="8 per row" onClick={() => onGridLayoutChange("grid8")}
                className={cn("flex flex-1 items-center justify-center transition-colors", gridLayout === "grid8" ? "text-yellow-500" : "text-gray-400 hover:text-gray-600")}>
                <Widget3 className="h-4 w-4" />
              </button>
            </div>
          </SolarProvider>
        </div>
      </div>
    );
  }

  // ─── Mobile / desktop category-pills-only row ────────────────────────────
  if (categoryPillsRowOnly) {
    return (
      <div ref={toolbarScrollRef as React.RefObject<HTMLDivElement>} className="min-w-0">
        <CategoryPillsRow
          categories={categories}
          selectedLevel1={selectedLevel1}
          selectedLevel2={selectedLevel2}
          selectedLevel3={selectedLevel3}
          onCategoryClick={handleCategoryClick}
          onCategoryHover={prefetchProducts}
          loading={categoriesLoading}
        />
      </div>
    );
  }

  // ─── Desktop: categories left · filter pill right ─────────────────────────
  return (
    <div ref={toolbarScrollRef as React.RefObject<HTMLDivElement>}
      className="flex w-full items-center gap-4">

      {/* Category pills — left, takes remaining space; h-10 is fixed to prevent layout shift */}
      {!hideCategoryPills && (
        <div className="min-w-0 flex-1">
          <CategorySectionsNav
            categories={categories}
            selectedLevel1={selectedLevel1}
            selectedLevel2={selectedLevel2}
            selectedLevel3={selectedLevel3}
            onCategoryClick={handleCategoryClick}
            onCategoryHover={prefetchProducts}
            loading={categoriesLoading}
          />
        </div>
      )}

      {/* Filter controls — far right */}
      <BrowseFilterControls
        filters={filters}
        onFiltersChange={onFiltersChange}
        onFiltersApply={onFiltersApply}
        gridLayout={gridLayout}
        onGridLayoutChange={onGridLayoutChange}
        productCount={productCount}
        additionalFilters={additionalFilters}
        className="ml-auto flex-shrink-0"
      />
    </div>
  );
}
