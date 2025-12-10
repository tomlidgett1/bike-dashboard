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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

const CONDITION_OPTIONS: { value: ConditionFilter; label: string }[] = [
  { value: 'all', label: 'Any Condition' },
  { value: 'New', label: 'New' },
  { value: 'Like New', label: 'Like New' },
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Good', label: 'Good' },
  { value: 'Fair', label: 'Fair' },
  { value: 'Well Used', label: 'Well Used' },
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

// Price presets for quick selection
const PRICE_PRESETS = [
  { label: 'Under $100', min: '', max: '100' },
  { label: '$100 - $500', min: '100', max: '500' },
  { label: '$500 - $1k', min: '500', max: '1000' },
  { label: '$1k - $2.5k', min: '1000', max: '2500' },
  { label: '$2.5k - $5k', min: '2500', max: '5000' },
  { label: 'Over $5k', min: '5000', max: '' },
];

function FilterSection({ 
  title, 
  children,
  icon: Icon,
  compact = false,
}: { 
  title: string; 
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-2", compact ? "space-y-1.5" : "space-y-2.5")}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-gray-500" />}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FilterContent({
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

  // Sync local filters when props change
  React.useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Close brand dropdown on click outside
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

  // Filter brands based on search
  const filteredBrands = brandSearch
    ? ALL_BRANDS.filter(brand => 
        brand.toLowerCase().includes(brandSearch.toLowerCase())
      )
    : ALL_BRANDS;

  // Check if filters are applied
  const hasActiveFilters = 
    localFilters.minPrice !== '' ||
    localFilters.maxPrice !== '' ||
    localFilters.condition !== 'all' ||
    localFilters.sortBy !== 'newest' ||
    localFilters.brand !== '';

  // Check if a price preset matches current filters
  const matchingPreset = PRICE_PRESETS.find(
    p => p.min === localFilters.minPrice && p.max === localFilters.maxPrice
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1">
        <div className="space-y-5 py-2">
          {/* Listing Type Filter - Mobile only */}
          {listingTypeFilter && onListingTypeChange && (
            <FilterSection title="Listing Type" icon={Package} compact>
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                <button
                  onClick={() => onListingTypeChange('all')}
                  className={cn(
                    "flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all cursor-pointer",
                    listingTypeFilter === 'all'
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70"
                  )}
                >
                  <Package className="h-4 w-4" />
                  All
                </button>
                
                <button
                  onClick={() => onListingTypeChange('stores')}
                  className={cn(
                    "flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all cursor-pointer",
                    listingTypeFilter === 'stores'
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70"
                  )}
                >
                  <Store className="h-4 w-4" />
                  Stores
                </button>
                
                <button
                  onClick={() => onListingTypeChange('individuals')}
                  className={cn(
                    "flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all cursor-pointer",
                    listingTypeFilter === 'individuals'
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70"
                  )}
                >
                  <User className="h-4 w-4" />
                  Private
                </button>
              </div>
            </FilterSection>
          )}

          {/* Brand Filter */}
          <FilterSection title="Brand" icon={Tag}>
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
                    if (localFilters.brand) {
                      updateFilter('brand', '');
                    }
                    setShowBrandDropdown(true);
                  }}
                  onFocus={() => setShowBrandDropdown(true)}
                  className="pl-9 pr-8 rounded-md h-10"
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
                    <X className="h-4 w-4 text-gray-400" />
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
                    className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {filteredBrands.length > 0 ? (
                      filteredBrands.slice(0, 20).map((brand) => (
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
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No brands found
                      </div>
                    )}
                    {filteredBrands.length > 20 && (
                      <div className="px-3 py-2 text-xs text-gray-400 border-t">
                        Type to search more brands...
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </FilterSection>

          {/* Price Range */}
          <FilterSection title="Price Range" icon={DollarSign}>
            {/* Price Presets */}
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

            {/* Custom Price Inputs */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <Input
                  type="number"
                  placeholder="Min"
                  value={localFilters.minPrice}
                  onChange={(e) => updateFilter('minPrice', e.target.value)}
                  className="pl-6 rounded-md h-9 text-sm"
                  min="0"
                />
              </div>
              <span className="text-gray-400 text-sm">to</span>
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={localFilters.maxPrice}
                  onChange={(e) => updateFilter('maxPrice', e.target.value)}
                  className="pl-6 rounded-md h-9 text-sm"
                  min="0"
                />
              </div>
            </div>
          </FilterSection>

          {/* Condition - Compact Dropdown */}
          <FilterSection title="Condition" icon={Sparkles} compact>
            <Select
              value={localFilters.condition}
              onValueChange={(value) => updateFilter('condition', value as ConditionFilter)}
            >
              <SelectTrigger className="w-full rounded-md h-10">
                <SelectValue placeholder="Any Condition" />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          {/* Sort By - Compact Dropdown */}
          <FilterSection title="Sort By" icon={ArrowUpDown} compact>
            <Select
              value={localFilters.sortBy}
              onValueChange={(value) => updateFilter('sortBy', value as SortOption)}
            >
              <SelectTrigger className="w-full rounded-md h-10">
                <SelectValue placeholder="Newest First" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-200 pt-4 pb-2 mt-4 space-y-2">
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
          className="w-full rounded-md bg-gray-900 hover:bg-gray-800 text-white h-11 text-sm font-medium"
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
        "group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-md font-medium transition-all whitespace-nowrap flex-shrink-0 cursor-pointer",
        activeFilterCount > 0
          ? "bg-gray-900 text-white shadow-md"
          : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
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
        <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md font-medium bg-white/20 text-white">
          {activeFilterCount}
        </span>
      )}
    </button>
  ) : (
    // Compact variant for floating bar
    <button
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-all",
        activeFilterCount > 0
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      All Filters
      {activeFilterCount > 0 && (
        <span className="ml-0.5 bg-white/20 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
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
          side="bottom" 
          className="h-[80vh] rounded-t-2xl px-4"
          showCloseButton={false}
        >
          <SheetHeader className="pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">Filters</SheetTitle>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-hidden pt-3">
            <FilterContent
              filters={filters}
              onFiltersChange={onFiltersChange}
              onApply={onApply}
              onReset={onReset}
              activeFilterCount={activeFilterCount}
              listingTypeFilter={listingTypeFilter}
              onListingTypeChange={onListingTypeChange}
              onClose={() => setIsOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      {/* Mobile: Sheet */}
      <div className="sm:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            {triggerButton}
          </SheetTrigger>
          <SheetContent 
            side="bottom" 
            className="h-[80vh] rounded-t-2xl px-4"
            showCloseButton={false}
          >
            <SheetHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-semibold">Filters</SheetTitle>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 -mr-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-hidden pt-3">
              <FilterContent
                filters={filters}
                onFiltersChange={onFiltersChange}
                onApply={onApply}
                onReset={onReset}
                activeFilterCount={activeFilterCount}
                listingTypeFilter={listingTypeFilter}
                onListingTypeChange={onListingTypeChange}
                onClose={() => setIsOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Dropdown */}
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
              className="absolute right-0 top-full mt-2 w-[340px] bg-white rounded-md border border-gray-200 shadow-xl z-50 overflow-hidden"
            >
              <div className="p-4 max-h-[70vh] overflow-y-auto">
                <FilterContent
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
