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

// Active Filter Chip Component
function ActiveFilterChip({ 
  label, 
  onRemove 
}: { 
  label: string; 
  onRemove: () => void;
}) {
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white text-xs font-medium rounded-md"
    >
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 hover:bg-white/20 rounded transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.span>
  );
}

function MobileFilterContent({
  filters,
  onFiltersChange,
  onApply,
  onReset,
  onClose,
  listingTypeFilter,
  onListingTypeChange,
  activeFilterCount,
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

  // Build active filter labels
  const getActiveFilterLabels = () => {
    const labels: { key: string; label: string; onRemove: () => void }[] = [];
    
    if (localFilters.brand) {
      labels.push({
        key: 'brand',
        label: localFilters.brand,
        onRemove: () => updateFilter('brand', ''),
      });
    }
    if (matchingPreset) {
      labels.push({
        key: 'price',
        label: matchingPreset.label,
        onRemove: () => {
          updateFilter('minPrice', '');
          updateFilter('maxPrice', '');
        },
      });
    } else if (localFilters.minPrice || localFilters.maxPrice) {
      const priceLabel = localFilters.minPrice && localFilters.maxPrice
        ? `$${localFilters.minPrice}-$${localFilters.maxPrice}`
        : localFilters.minPrice
        ? `$${localFilters.minPrice}+`
        : `Up to $${localFilters.maxPrice}`;
      labels.push({
        key: 'price',
        label: priceLabel,
        onRemove: () => {
          updateFilter('minPrice', '');
          updateFilter('maxPrice', '');
        },
      });
    }
    if (localFilters.condition !== 'all') {
      labels.push({
        key: 'condition',
        label: localFilters.condition,
        onRemove: () => updateFilter('condition', 'all'),
      });
    }
    if (localFilters.sortBy !== 'newest') {
      const sortLabel = SORT_OPTIONS.find(s => s.value === localFilters.sortBy)?.label || '';
      labels.push({
        key: 'sort',
        label: sortLabel,
        onRemove: () => updateFilter('sortBy', 'newest'),
      });
    }
    
    return labels;
  };

  const activeLabels = getActiveFilterLabels();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Handle Bar */}
      <div className="flex-shrink-0 pt-2 pb-1">
        <div className="w-8 h-1 bg-gray-300 rounded-full mx-auto" />
      </div>
      
      {/* Compact Header */}
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Filters</h2>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-900 text-white rounded-md">
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-600 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Active Filters - Horizontal scroll */}
        <AnimatePresence>
          {activeLabels.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
                {activeLabels.map((filter) => (
                  <ActiveFilterChip
                    key={filter.key}
                    label={filter.label}
                    onRemove={filter.onRemove}
                  />
                ))}
                <button
                  onClick={handleReset}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap pl-1"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scrollable Content - Fixed for proper scrolling */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="px-4 pb-4 space-y-4">
          {/* Sort By - Inline with Select dropdown */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">Sort by</span>
            <Select
              value={localFilters.sortBy}
              onValueChange={(value) => updateFilter('sortBy', value as SortOption)}
            >
              <SelectTrigger className="w-[160px] h-9 rounded-md border-gray-200 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seller Type - Inline horizontal chips */}
          {listingTypeFilter && onListingTypeChange && (
            <div className="py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700 block mb-2">Seller Type</span>
              <div className="flex gap-2">
                {[
                  { value: 'all' as const, label: 'All' },
                  { value: 'stores' as const, label: 'Stores' },
                  { value: 'individuals' as const, label: 'Private' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onListingTypeChange(option.value)}
                    className={cn(
                      "flex-1 py-2 px-3 text-sm font-medium rounded-md transition-all",
                      listingTypeFilter === option.value
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price Range - Horizontal scrolling presets + compact inputs */}
          <div className="py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700 block mb-2">Price</span>
            
            {/* Horizontal scrolling presets */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
              {PRICE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    updateFilter('minPrice', preset.min);
                    updateFilter('maxPrice', preset.max);
                  }}
                  className={cn(
                    "flex-shrink-0 py-1.5 px-3 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                    matchingPreset?.label === preset.label
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Compact price inputs */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <Input
                  type="number"
                  placeholder="Min"
                  value={localFilters.minPrice}
                  onChange={(e) => updateFilter('minPrice', e.target.value)}
                  className="pl-6 rounded-md h-9 text-sm border-gray-200"
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
                  className="pl-6 rounded-md h-9 text-sm border-gray-200"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Condition - Horizontal scrolling chips */}
          <div className="py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700 block mb-2">Condition</span>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
              {CONDITION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateFilter('condition', option.value)}
                  className={cn(
                    "flex-shrink-0 py-1.5 px-3 text-sm font-medium rounded-md transition-all whitespace-nowrap",
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

          {/* Brand - Compact search */}
          <div className="py-2">
            <span className="text-sm font-medium text-gray-700 block mb-2">Brand</span>
            <div className="relative" ref={brandDropdownRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                  className="pl-8 pr-8 rounded-md h-9 text-sm border-gray-200"
                />
                {(localFilters.brand || brandSearch) && (
                  <button
                    onClick={() => {
                      updateFilter('brand', '');
                      setBrandSearch('');
                      brandInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
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
                      filteredBrands.slice(0, 12).map((brand) => (
                        <button
                          key={brand}
                          onClick={() => {
                            updateFilter('brand', brand);
                            setBrandSearch('');
                            setShowBrandDropdown(false);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between",
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Footer */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button
              onClick={handleReset}
              variant="outline"
              size="sm"
              className="h-10 rounded-md border-gray-200 text-gray-600 font-medium"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            onClick={handleApply}
            className="flex-1 h-10 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
          >
            Show Results
          </Button>
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
          className="rounded-t-2xl p-0 gap-0 h-[70vh] flex flex-col"
          showCloseButton={false}
        >
          <MobileFilterContent
            filters={filters}
            onFiltersChange={onFiltersChange}
            onApply={onApply}
            onReset={onReset}
            activeFilterCount={activeFilterCount}
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
      {/* Mobile: Sheet with beautiful mobile-optimised UI */}
      <div className="sm:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            {triggerButton}
          </SheetTrigger>
          <SheetContent 
            side="bottom" 
            className="h-[70vh] rounded-t-2xl p-0 flex flex-col"
            showCloseButton={false}
          >
            <MobileFilterContent
              filters={filters}
              onFiltersChange={onFiltersChange}
              onApply={onApply}
              onReset={onReset}
              activeFilterCount={activeFilterCount}
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
