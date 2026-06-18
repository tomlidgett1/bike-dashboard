"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  SlidersHorizontal, 
  X, 
  ChevronDown, 
  Check, 
  DollarSign,
  ArrowUpDown,
  Sparkles,
  RotateCcw,
  Search,
  Tag,
  Package,
  Store,
  User
} from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

// ============================================================
// Advanced Filters Component
// Beautiful mobile sheet + desktop popover for advanced filtering
// Enterprise-grade with instant feedback
// ============================================================

export type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc';
export type ConditionFilter = 'all' | 'New' | 'Like New' | 'Excellent' | 'Good' | 'Fair' | 'Well Used';

export interface AdvancedFiltersState {
  minPrice: string;
  maxPrice: string;
  condition: ConditionFilter;
  sortBy: SortOption;
  brand: string;
}

interface AdvancedFiltersProps {
  filters: AdvancedFiltersState;
  onFiltersChange: (filters: AdvancedFiltersState) => void;
  onApply: () => void;
  onReset: () => void;
  activeFilterCount: number;
  /** Variant: 'default' for normal filter button, 'compact' for floating bar style */
  variant?: 'default' | 'compact';
  /** Listing type filter state */
  listingTypeFilter?: 'all' | 'stores' | 'individuals';
  /** Callback for listing type changes */
  onListingTypeChange?: (filter: 'all' | 'stores' | 'individuals') => void;
  /** Product count for the mobile apply button label */
  productCount?: number;
  /** When false, local draft state is frozen until the sheet opens again */
  sheetOpen?: boolean;
}

const SORT_OPTIONS: { value: SortOption; label: string; description: string }[] = [
  { value: 'newest', label: 'Newest First', description: 'Most recently listed' },
  { value: 'oldest', label: 'Oldest First', description: 'Longest listed' },
  { value: 'price_asc', label: 'Price: Low to High', description: 'Cheapest first' },
  { value: 'price_desc', label: 'Price: High to Low', description: 'Most expensive first' },
];

const CONDITION_OPTIONS: { value: ConditionFilter; label: string; emoji: string }[] = [
  { value: 'all', label: 'Any', emoji: '✨' },
  { value: 'New', label: 'New', emoji: '🆕' },
  { value: 'Like New', label: 'Like New', emoji: '⭐' },
  { value: 'Excellent', label: 'Excellent', emoji: '💎' },
  { value: 'Good', label: 'Good', emoji: '👍' },
  { value: 'Fair', label: 'Fair', emoji: '👌' },
  { value: 'Well Used', label: 'Well Used', emoji: '🔧' },
];

// Combined and sorted list of all brands
const ALL_BRANDS = [
  // Bike Brands
  'Specialized', 'Trek', 'Giant', 'Cannondale', 'Scott', 'Santa Cruz',
  'Cervélo', 'Pinarello', 'BMC', 'Canyon', 'Focus', 'Merida', 'Bianchi',
  'Colnago', 'Ridley', 'Wilier', 'De Rosa', 'Look', 'Time', 'Pivot',
  'Yeti', 'Orbea', 'Cube', 'Felt', 'Fuji', 'GT', 'Kona', 'Norco',
  'Polygon', 'Marin', 'Salsa', 'Surly', 'All-City', 'Ribble', 'Rose',
  'Van Nicholas', 'Lynskey', 'Moots', 'Seven', 'Independent Fabrication',
  // Component Brands
  'Shimano', 'SRAM', 'Campagnolo', 'FSA', 'Rotor', 'Praxis', 'Race Face',
  'Hope', 'Chris King', 'DT Swiss', 'Mavic', 'Zipp', 'ENVE', 'Reynolds',
  'Fulcrum', 'Hunt', 'Roval', 'Bontrager', 'Easton', 'Continental',
  'Schwalbe', 'Pirelli', 'Michelin', 'Vittoria', 'Maxxis', 'WTB',
  'Fox', 'RockShox', 'Magura', 'Formula', 'Avid', 'Hayes',
].sort();

// Price presets for quick selection - mobile optimised
const PRICE_PRESETS = [
  { label: '<$100', min: '', max: '100' },
  { label: '$100-500', min: '100', max: '500' },
  { label: '$500-1k', min: '500', max: '1000' },
  { label: '$1k-2.5k', min: '1000', max: '2500' },
  { label: '$2.5k-5k', min: '2500', max: '5000' },
  { label: '$5k+', min: '5000', max: '' },
];

const BRAND_YELLOW = '#ffde59';
const FILTER_INK = '#1c1c1e';
const MAX_PRICE_SLIDER = 5000;

const QUICK_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

const SELLER_OPTIONS: { value: 'all' | 'stores' | 'individuals'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'stores', label: 'Stores' },
  { value: 'individuals', label: 'Private' },
];

// Collapsible Filter Section Component
function FilterSection({ 
  title, 
  children,
  icon: Icon,
  defaultOpen = true,
  badge,
}: { 
  title: string; 
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  
  return (
    <div className="bg-white rounded-md border border-gray-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center">
              <Icon className="h-4 w-4 text-gray-600" />
            </div>
          )}
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-900 text-white rounded-md">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown 
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-180"
          )} 
        />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ 
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98]
            }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function countLocalActiveFilters(
  localFilters: AdvancedFiltersState,
  listingType?: 'all' | 'stores' | 'individuals'
) {
  return (
    (localFilters.minPrice || localFilters.maxPrice ? 1 : 0) +
    (localFilters.condition !== 'all' ? 1 : 0) +
    (localFilters.sortBy !== 'newest' ? 1 : 0) +
    (localFilters.brand ? 1 : 0) +
    (listingType && listingType !== 'all' ? 1 : 0)
  );
}

function FilterSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
      {children}
    </p>
  );
}

function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center rounded-md bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-md px-2 py-2 text-[13px] font-medium transition-colors",
            value === o.value
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PriceSlider({
  minPrice,
  maxPrice,
  onMinChange,
  onMaxChange,
}: {
  minPrice: string;
  maxPrice: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  const min =
    minPrice === "" ? 0 : Math.min(Number(minPrice) || 0, MAX_PRICE_SLIDER);
  const max =
    maxPrice === ""
      ? MAX_PRICE_SLIDER
      : Math.min(Number(maxPrice) || MAX_PRICE_SLIDER, MAX_PRICE_SLIDER);
  const leftPct = (min / MAX_PRICE_SLIDER) * 100;
  const rightPct = (max / MAX_PRICE_SLIDER) * 100;
  const [dragging, setDragging] = React.useState<"min" | "max" | null>(null);

  const minZIndex =
    dragging === "min" ? 30 : dragging === "max" ? 10 : min < max - MAX_PRICE_SLIDER * 0.15 ? 25 : 15;
  const maxZIndex = dragging === "max" ? 30 : dragging === "min" ? 10 : 20;

  const rangeInputClass =
    "absolute inset-x-0 top-1/2 h-12 w-full -translate-y-1/2 cursor-grab appearance-none bg-transparent touch-manipulation active:cursor-grabbing " +
    "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent " +
    "[&::-webkit-slider-thumb]:mt-[-11px] [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 " +
    "[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-medium text-gray-500">Price range</span>
        <span className="text-[13px] font-semibold text-gray-900">
          ${min.toLocaleString()} – {max >= MAX_PRICE_SLIDER ? "$5,000+" : `$${max.toLocaleString()}`}
        </span>
      </div>
      <div className="relative h-12 touch-manipulation">
        <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%`, backgroundColor: FILTER_INK }}
        />
        <input
          type="range"
          min={0}
          max={MAX_PRICE_SLIDER}
          step={50}
          value={min}
          style={{ zIndex: minZIndex }}
          onPointerDown={() => setDragging("min")}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
          onInput={(e) => {
            const v = Math.min(Number(e.currentTarget.value), max - 50);
            onMinChange(v <= 0 ? "" : String(v));
          }}
          className={rangeInputClass}
          aria-label="Minimum price"
        />
        <input
          type="range"
          min={0}
          max={MAX_PRICE_SLIDER}
          step={50}
          value={max}
          style={{ zIndex: maxZIndex }}
          onPointerDown={() => setDragging("max")}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
          onInput={(e) => {
            const v = Math.max(Number(e.currentTarget.value), min + 50);
            onMaxChange(v >= MAX_PRICE_SLIDER ? "" : String(v));
          }}
          className={rangeInputClass}
          aria-label="Maximum price"
        />
      </div>
    </div>
  );
}

export function MobileFilterContent({
  filters,
  onFiltersChange,
  onApply,
  onReset,
  onClose,
  listingTypeFilter,
  onListingTypeChange,
  productCount,
  sheetOpen = true,
  /** Content above sort/price (e.g. category pills) inside the scrollable area */
  topSection,
}: AdvancedFiltersProps & { onClose?: () => void; topSection?: React.ReactNode }) {
  const [localFilters, setLocalFilters] = React.useState(filters);
  const [localListingType, setLocalListingType] = React.useState<
    'all' | 'stores' | 'individuals'
  >(listingTypeFilter ?? 'all');
  const [brandSearch, setBrandSearch] = React.useState('');
  const [showBrandDropdown, setShowBrandDropdown] = React.useState(false);
  const brandInputRef = React.useRef<HTMLInputElement>(null);
  const brandSectionRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const wasSheetOpenRef = React.useRef(false);

  // Only hydrate draft state when the sheet opens — avoids parent refetches wiping edits.
  React.useEffect(() => {
    if (sheetOpen && !wasSheetOpenRef.current) {
      setLocalFilters(filters);
      setLocalListingType(listingTypeFilter ?? 'all');
      setBrandSearch('');
      setShowBrandDropdown(false);
    }
    wasSheetOpenRef.current = sheetOpen;
  }, [sheetOpen, filters, listingTypeFilter]);

  React.useEffect(() => {
    const closeBrandDropdown = (e: PointerEvent) => {
      if (brandSectionRef.current && !brandSectionRef.current.contains(e.target as Node)) {
        setShowBrandDropdown(false);
      }
    };
    document.addEventListener("pointerdown", closeBrandDropdown, true);
    return () => document.removeEventListener("pointerdown", closeBrandDropdown, true);
  }, []);

  const updateFilter = React.useCallback(<K extends keyof AdvancedFiltersState>(
    key: K,
    value: AdvancedFiltersState[K]
  ) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleApply = () => {
    onFiltersChange(localFilters);
    if (onListingTypeChange && localListingType !== listingTypeFilter) {
      onListingTypeChange(localListingType);
    }
    onApply();
    onClose?.();
  };

  const handleReset = () => {
    const resetFilters: AdvancedFiltersState = {
      minPrice: '',
      maxPrice: '',
      condition: 'all',
      sortBy: 'newest',
      brand: '',
    };
    setLocalFilters(resetFilters);
    setLocalListingType('all');
    setBrandSearch('');
    setShowBrandDropdown(false);
    onFiltersChange(resetFilters);
    onListingTypeChange?.('all');
    onReset();
  };

  const filteredBrands = React.useMemo(() => {
    if (!brandSearch.trim()) return [];
    const query = brandSearch.toLowerCase();
    return ALL_BRANDS.filter((brand) => brand.toLowerCase().includes(query)).slice(0, 12);
  }, [brandSearch]);

  const localActiveCount = countLocalActiveFilters(localFilters, localListingType);
  const applyLabel =
    productCount !== undefined
      ? `Show ${productCount.toLocaleString()} results`
      : 'Show results';

  const applyQuickToggle = (id: string) => {
    if (id === 'under500') {
      setLocalFilters((prev) => ({ ...prev, minPrice: '', maxPrice: '500' }));
    } else if (id === 'new') {
      setLocalFilters((prev) => ({ ...prev, condition: 'New' }));
    } else if (id === 'stores') {
      setLocalListingType('stores');
    } else if (id === 'cheapest') {
      setLocalFilters((prev) => ({ ...prev, sortBy: 'price_asc' }));
    }
  };

  const quickToggles = [
    { id: 'under500', label: 'Under $500' },
    { id: 'new', label: 'New only' },
    ...(onListingTypeChange ? [{ id: 'stores', label: 'Stores' }] : []),
    { id: 'cheapest', label: 'Cheapest first' },
  ];

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-shrink-0 border-b border-gray-100 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            {localActiveCount > 0 && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-gray-900"
                style={{ backgroundColor: BRAND_YELLOW }}
              >
                {localActiveCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close filters"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-0.5 text-[13px] text-gray-500">Tap to filter fast</p>
      </div>

      <div
        ref={scrollRef}
        onScroll={() => setShowBrandDropdown(false)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y"
      >
        <div className="space-y-5 px-4 py-4">
          {topSection}

          <div>
            <FilterSectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Popular
              </span>
            </FilterSectionLabel>
            <div className="flex flex-wrap gap-2">
              {quickToggles.map((toggle) => (
                <button
                  key={toggle.id}
                  type="button"
                  onClick={() => applyQuickToggle(toggle.id)}
                  className="min-h-11 touch-manipulation rounded-md border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-gray-700 transition-colors hover:border-gray-900"
                >
                  {toggle.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-gray-100 bg-gray-50/70 p-3.5">
            <PriceSlider
              minPrice={localFilters.minPrice}
              maxPrice={localFilters.maxPrice}
              onMinChange={(value) => updateFilter('minPrice', value)}
              onMaxChange={(value) => updateFilter('maxPrice', value)}
            />
          </div>

          <div>
            <FilterSectionLabel>Sort</FilterSectionLabel>
            <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 touch-pan-x">
              {QUICK_SORT_OPTIONS.map((option) => {
                const active = localFilters.sortBy === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateFilter('sortBy', option.value)}
                    className={cn(
                      "min-h-11 flex-shrink-0 touch-manipulation whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] font-medium transition-colors",
                      active ? "text-gray-900 shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                    style={active ? { backgroundColor: BRAND_YELLOW } : undefined}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FilterSectionLabel>Condition</FilterSectionLabel>
            <div className="flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map((option) => {
                const active = localFilters.condition === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateFilter('condition', option.value)}
                    className={cn(
                      "min-h-11 touch-manipulation rounded-full px-4 py-2.5 text-[13px] font-medium transition-colors",
                      active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {onListingTypeChange && (
            <div>
              <FilterSectionLabel>Seller</FilterSectionLabel>
              <SegmentedRow
                options={SELLER_OPTIONS}
                value={localListingType}
                onChange={setLocalListingType}
              />
            </div>
          )}

          <div ref={brandSectionRef}>
            <FilterSectionLabel>Brand</FilterSectionLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                ref={brandInputRef}
                type="text"
                placeholder="Search brands…"
                value={localFilters.brand || brandSearch}
                onChange={(e) => {
                  const next = e.target.value;
                  setBrandSearch(next);
                  if (localFilters.brand) {
                    updateFilter('brand', '');
                  }
                  setShowBrandDropdown(next.trim().length > 0);
                }}
                onFocus={() => {
                  if (brandSearch.trim().length > 0) {
                    setShowBrandDropdown(true);
                  }
                }}
                className="h-11 rounded-md border-gray-200 pl-9 pr-8 text-[14px] touch-manipulation"
              />
              {(localFilters.brand || brandSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    updateFilter('brand', '');
                    setBrandSearch('');
                    setShowBrandDropdown(false);
                    brandInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 touch-manipulation items-center justify-center rounded-md hover:bg-gray-100"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              )}
            </div>

            {showBrandDropdown && brandSearch.trim().length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
                {filteredBrands.length > 0 ? (
                  filteredBrands.map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => {
                        updateFilter('brand', brand);
                        setBrandSearch('');
                        setShowBrandDropdown(false);
                      }}
                      className={cn(
                        "flex min-h-11 w-full touch-manipulation items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-50",
                        localFilters.brand === brand && "bg-gray-50 font-medium"
                      )}
                    >
                      {brand}
                      {localFilters.brand === brand && (
                        <Check className="h-4 w-4 text-gray-700" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-sm text-gray-500">
                    No brands found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            disabled={localActiveCount === 0}
            className="flex h-12 min-w-[5.5rem] touch-manipulation items-center gap-1.5 rounded-md px-4 text-[14px] font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex h-12 min-h-12 flex-1 touch-manipulation items-center justify-center rounded-md text-[15px] font-semibold transition-colors"
            style={{ backgroundColor: BRAND_YELLOW, color: FILTER_INK }}
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Desktop Filter Content (simpler, no collapsible sections)
function DesktopFilterContent({
  filters,
  onFiltersChange,
  onApply,
  onReset,
  onClose,
  listingTypeFilter,
  onListingTypeChange,
}: AdvancedFiltersProps & { onClose?: () => void }) {
  const [localFilters, setLocalFilters] = React.useState(filters);
  const [brandSearch, setBrandSearch] = React.useState('');
  const [showBrandDropdown, setShowBrandDropdown] = React.useState(false);
  const brandInputRef = React.useRef<HTMLInputElement>(null);
  const brandDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(e.target as Node)) {
        setShowBrandDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateFilter = <K extends keyof AdvancedFiltersState>(
    key: K,
    value: AdvancedFiltersState[K]
  ) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onApply();
    onClose?.();
  };

  const handleReset = () => {
    const resetFilters: AdvancedFiltersState = {
      minPrice: '',
      maxPrice: '',
      condition: 'all',
      sortBy: 'newest',
      brand: '',
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
    onReset();
  };

  const filteredBrands = brandSearch
    ? ALL_BRANDS.filter(brand => 
        brand.toLowerCase().includes(brandSearch.toLowerCase())
      )
    : ALL_BRANDS;

  const hasActiveFilters = 
    localFilters.minPrice !== '' ||
    localFilters.maxPrice !== '' ||
    localFilters.condition !== 'all' ||
    localFilters.sortBy !== 'newest' ||
    localFilters.brand !== '';

  const matchingPreset = PRICE_PRESETS.find(
    p => p.min === localFilters.minPrice && p.max === localFilters.maxPrice
  );

  return (
    <div className="space-y-5 p-4">
      {/* Sort By */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Sort By</h3>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => updateFilter('sortBy', option.value)}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium rounded-md transition-all text-left",
                localFilters.sortBy === option.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Brand */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Brand</h3>
        </div>
        <div className="relative" ref={brandDropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              ref={brandInputRef}
              type="text"
              placeholder="Search brands..."
              value={localFilters.brand || brandSearch}
              onChange={(e) => {
                setBrandSearch(e.target.value);
                if (localFilters.brand) updateFilter('brand', '');
                setShowBrandDropdown(true);
              }}
              onFocus={() => setShowBrandDropdown(true)}
              className="pl-9 pr-8 rounded-md h-9 text-sm"
            />
            {(localFilters.brand || brandSearch) && (
              <button
                onClick={() => {
                  updateFilter('brand', '');
                  setBrandSearch('');
                  brandInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-3.5 w-3.5 text-gray-400" />
              </button>
            )}
          </div>
          
          <AnimatePresence>
            {showBrandDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto"
              >
                {filteredBrands.length > 0 ? (
                  filteredBrands.slice(0, 15).map((brand) => (
                    <button
                      key={brand}
                      onClick={() => {
                        updateFilter('brand', brand);
                        setBrandSearch('');
                        setShowBrandDropdown(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between",
                        localFilters.brand === brand && "bg-gray-100 font-medium"
                      )}
                    >
                      {brand}
                      {localFilters.brand === brand && (
                        <Check className="h-4 w-4 text-gray-700" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500">No brands found</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Price Range */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Price Range</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                updateFilter('minPrice', preset.min);
                updateFilter('maxPrice', preset.max);
              }}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-md transition-all",
                matchingPreset?.label === preset.label
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <Input
              type="number"
              placeholder="Min"
              value={localFilters.minPrice}
              onChange={(e) => updateFilter('minPrice', e.target.value)}
              className="pl-6 rounded-md h-8 text-sm"
              min="0"
            />
          </div>
          <span className="text-gray-400 text-xs">to</span>
          <div className="flex-1 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <Input
              type="number"
              placeholder="Max"
              value={localFilters.maxPrice}
              onChange={(e) => updateFilter('maxPrice', e.target.value)}
              className="pl-6 rounded-md h-8 text-sm"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Condition */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Condition</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CONDITION_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => updateFilter('condition', option.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                localFilters.condition === option.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 pt-4 space-y-2">
        {hasActiveFilters && (
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset All
          </button>
        )}
        <Button
          onClick={handleApply}
          className="w-full rounded-md bg-gray-900 hover:bg-gray-800 text-white h-10 text-sm font-medium"
        >
          Apply Filters
        </Button>
      </div>
    </div>
  );
}

export function AdvancedFilters({
  filters,
  onFiltersChange,
  onApply,
  onReset,
  activeFilterCount,
  variant = 'default',
  listingTypeFilter,
  onListingTypeChange,
  productCount,
}: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDesktopOpen, setIsDesktopOpen] = React.useState(false);
  const desktopRef = React.useRef<HTMLDivElement>(null);

  // Close desktop dropdown on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (desktopRef.current && !desktopRef.current.contains(e.target as Node)) {
        setIsDesktopOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Default trigger button style - matches category pill design
  const triggerButton = variant === 'default' ? (
    <button
      className={cn(
        "group flex h-10 min-h-10 items-center gap-1.5 sm:gap-2 rounded-full px-3 sm:px-4 font-medium transition-all whitespace-nowrap flex-shrink-0 cursor-pointer box-border border-2",
        activeFilterCount > 0
          ? "border-gray-900 bg-gray-900 text-white shadow-md"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:shadow-sm"
      )}
    >
      <SlidersHorizontal className={cn(
        "transition-opacity",
        activeFilterCount > 0 ? "opacity-100" : "opacity-60 group-hover:opacity-80"
      )} 
      style={{ width: activeFilterCount > 0 ? 20 : 18, height: activeFilterCount > 0 ? 20 : 18 }} 
      />
      <span className="text-xs sm:text-sm">Filters</span>
      {activeFilterCount > 0 && (
        <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-medium bg-white/20 text-white">
          {activeFilterCount}
        </span>
      )}
    </button>
  ) : (
    // Compact variant for floating bar
    <button
      className={cn(
        "flex h-10 min-h-10 items-center gap-1.5 rounded-full border-2 px-3 text-xs font-medium transition-all box-border",
        activeFilterCount > 0
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      All Filters
      {activeFilterCount > 0 && (
        <span className="ml-0.5 bg-white/20 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
          {activeFilterCount}
        </span>
      )}
    </button>
  );

  // For compact variant, always use sheet (since it's for mobile floating bar)
  if (variant === 'compact') {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          {triggerButton}
        </SheetTrigger>
        <SheetContent 
          side="right" 
          className="w-[50vw] min-w-[280px] max-w-[400px] p-0 gap-0 h-full flex flex-col"
          showCloseButton={false}
        >
          <MobileFilterContent
            filters={filters}
            onFiltersChange={onFiltersChange}
            onApply={onApply}
            onReset={onReset}
            activeFilterCount={activeFilterCount}
            productCount={productCount}
            sheetOpen={isOpen}
            listingTypeFilter={listingTypeFilter}
            onListingTypeChange={onListingTypeChange}
            onClose={() => setIsOpen(false)}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      {/* Mobile: Sheet slides from right with 50% width */}
      <div className="sm:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            {triggerButton}
          </SheetTrigger>
          <SheetContent 
            side="right" 
            className="w-[50vw] min-w-[280px] max-w-[400px] p-0 gap-0 h-full flex flex-col"
            showCloseButton={false}
          >
            <MobileFilterContent
              filters={filters}
              onFiltersChange={onFiltersChange}
              onApply={onApply}
              onReset={onReset}
              activeFilterCount={activeFilterCount}
              productCount={productCount}
              sheetOpen={isOpen}
              listingTypeFilter={listingTypeFilter}
              onListingTypeChange={onListingTypeChange}
              onClose={() => setIsOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Dropdown with cleaner layout */}
      <div className="hidden sm:block relative" ref={desktopRef}>
        <div onClick={() => setIsDesktopOpen(!isDesktopOpen)}>
          {triggerButton}
        </div>
        
        <AnimatePresence>
          {isDesktopOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="absolute right-0 top-full mt-2 w-[340px] bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden"
            >
              <div className="max-h-[70vh] overflow-y-auto">
                <DesktopFilterContent
                  filters={filters}
                  onFiltersChange={onFiltersChange}
                  onApply={onApply}
                  onReset={onReset}
                  activeFilterCount={activeFilterCount}
                  listingTypeFilter={listingTypeFilter}
                  onListingTypeChange={onListingTypeChange}
                  onClose={() => setIsDesktopOpen(false)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// Default filter state
export const DEFAULT_ADVANCED_FILTERS: AdvancedFiltersState = {
  minPrice: '',
  maxPrice: '',
  condition: 'all',
  sortBy: 'newest',
  brand: '',
};

// Helper to count active filters
export function countActiveFilters(filters: AdvancedFiltersState): number {
  let count = 0;
  if (filters.minPrice !== '') count++;
  if (filters.maxPrice !== '') count++;
  if (filters.condition !== 'all') count++;
  if (filters.sortBy !== 'newest') count++;
  if (filters.brand !== '') count++;
  return count;
}
