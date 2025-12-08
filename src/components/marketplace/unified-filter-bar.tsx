"use client";

import * as React from "react";
import { 
  Bike, Settings, Shirt, Apple, Package, Loader2, X, 
  ChevronRight, Store, User, TrendingUp, Heart
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { preload } from "swr";

// ============================================================
// Unified Filter Bar
// Clean, modern filter experience combining:
// - View modes (Trending, For You, Browse)
// - Category navigation (3-level hierarchy)
// - Source filter (All, Stores, Individuals)
// Mobile-first with smooth animations
// ============================================================

// Prefetch function for category products
const prefetchCategoryProducts = (level1?: string, level2?: string, level3?: string) => {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('pageSize', '50');
  if (level1) params.set('level1', level1);
  if (level2) params.set('level2', level2);
  if (level3) params.set('level3', level3);
  
  const url = `/api/marketplace/products?${params}`;
  preload(url, (url: string) => fetch(url).then(res => res.json()));
};

export type ViewMode = 'trending' | 'for-you' | 'all';
export type ListingTypeFilter = 'all' | 'stores' | 'individuals';

interface CategoryHierarchy {
  level1: string;
  level2Categories: {
    name: string;
    count: number;
    level3Categories: {
      name: string;
      count: number;
    }[];
  }[];
  totalProducts: number;
}

interface UnifiedFilterBarProps {
  // View mode
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showForYouBadge?: boolean;
  
  // Category filters
  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onLevel1Change: (category: string | null) => void;
  onLevel2Change: (subcategory: string | null) => void;
  onLevel3Change: (level3: string | null) => void;
  
  // Listing type filter
  listingTypeFilter: ListingTypeFilter;
  onListingTypeChange: (filter: ListingTypeFilter) => void;
  
  // Product count
  productCount?: number;
  
  // Additional filters slot (e.g., AdvancedFilters component)
  additionalFilters?: React.ReactNode;
}

// Category icon mapping
const getCategoryIcon = (categoryName: string) => {
  const name = categoryName.toLowerCase();
  if (name.includes('bike') || name.includes('bicycle')) return Bike;
  if (name.includes('apparel') || name.includes('clothing')) return Shirt;
  if (name.includes('nutrition') || name.includes('food')) return Apple;
  if (name.includes('part') || name.includes('component')) return Settings;
  return Package;
};

export function UnifiedFilterBar({
  viewMode,
  onViewModeChange,
  showForYouBadge = false,
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onLevel1Change,
  onLevel2Change,
  onLevel3Change,
  listingTypeFilter,
  onListingTypeChange,
  productCount,
  additionalFilters,
}: UnifiedFilterBarProps) {
  const [categories, setCategories] = React.useState<CategoryHierarchy[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Fetch categories
  React.useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (listingTypeFilter === 'stores') {
          params.set('listingType', 'store_inventory');
        } else if (listingTypeFilter === 'individuals') {
          params.set('listingType', 'private_listing');
        }
        
        const url = params.toString() 
          ? `/api/marketplace/categories?${params}` 
          : '/api/marketplace/categories';
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch (error) {
        console.error('[UnifiedFilterBar] Error fetching categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, [listingTypeFilter]);

  // Get current category data
  const selectedCategory = categories.find(c => c.level1 === selectedLevel1);
  const selectedSubcategory = selectedCategory?.level2Categories.find(l2 => l2.name === selectedLevel2);
  
  // Helper to clear all category filters
  const clearAllCategories = () => {
    onLevel1Change(null);
    onLevel2Change(null);
    onLevel3Change(null);
  };

  // Determine what category options to show
  const getCategoryOptions = () => {
    if (selectedLevel2 && selectedSubcategory?.level3Categories.length) {
      return selectedSubcategory.level3Categories.map(l3 => ({
        name: l3.name,
        count: l3.count,
        level: 3 as const,
        isActive: selectedLevel3 === l3.name,
      }));
    }
    if (selectedLevel1 && selectedCategory?.level2Categories.length) {
      return selectedCategory.level2Categories.map(l2 => ({
        name: l2.name,
        count: l2.count,
        level: 2 as const,
        isActive: selectedLevel2 === l2.name,
        hasChildren: l2.level3Categories.length > 0,
      }));
    }
    return categories.map(cat => ({
      name: cat.level1,
      count: cat.totalProducts,
      level: 1 as const,
      isActive: selectedLevel1 === cat.level1,
      hasChildren: cat.level2Categories.length > 0,
      icon: getCategoryIcon(cat.level1),
    }));
  };

  const categoryOptions = getCategoryOptions();

  // Handle category selection
  const handleCategorySelect = (option: typeof categoryOptions[0]) => {
    if (option.level === 1) {
      if (option.isActive) {
        clearAllCategories();
      } else {
        onLevel1Change(option.name);
        onLevel2Change(null);
        onLevel3Change(null);
        prefetchCategoryProducts(option.name);
      }
    } else if (option.level === 2) {
      if (option.isActive) {
        onLevel2Change(null);
        onLevel3Change(null);
      } else {
        onLevel2Change(option.name);
        onLevel3Change(null);
        if (selectedLevel1) prefetchCategoryProducts(selectedLevel1, option.name);
      }
    } else if (option.level === 3) {
      if (option.isActive) {
        onLevel3Change(null);
      } else {
        onLevel3Change(option.name);
        if (selectedLevel1 && selectedLevel2) {
          prefetchCategoryProducts(selectedLevel1, selectedLevel2, option.name);
        }
      }
    }
  };

  // Build breadcrumb trail
  const breadcrumbs = [];
  if (selectedLevel1) {
    breadcrumbs.push({ label: selectedLevel1, onClick: () => { onLevel2Change(null); onLevel3Change(null); } });
  }
  if (selectedLevel2) {
    breadcrumbs.push({ label: selectedLevel2, onClick: () => { onLevel3Change(null); } });
  }
  if (selectedLevel3) {
    breadcrumbs.push({ label: selectedLevel3, onClick: () => {} });
  }

  const isOnBrowseMode = viewMode === 'all';

  return (
    <div className="space-y-3">
      {/* Primary Row: View Mode Tabs + Source Filter Tabs (desktop only) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* View Mode Tabs - Full width on mobile */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-full sm:w-auto">
          <button
            onClick={() => onViewModeChange('trending')}
            className={cn(
              "flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap",
              viewMode === 'trending'
                ? "text-gray-900 bg-white shadow-sm"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-200/60"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Trending</span>
            <span className="sm:hidden">Hot</span>
          </button>
          
          <button
            onClick={() => onViewModeChange('for-you')}
            className={cn(
              "relative flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap",
              viewMode === 'for-you'
                ? "text-gray-900 bg-white shadow-sm"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-200/60"
            )}
          >
            <Heart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">For You</span>
            <span className="xs:hidden">You</span>
            {showForYouBadge && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#FFC72C] rounded-full" />
            )}
          </button>
          
          <button
            onClick={() => onViewModeChange('all')}
            className={cn(
              "flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap",
              viewMode === 'all'
                ? "text-gray-900 bg-white shadow-sm"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-200/60"
            )}
          >
            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Browse
          </button>
        </div>

        {/* Source Filter Tabs + Advanced Filters - only on Browse mode - Same row on desktop */}
        {isOnBrowseMode && (
          <div className="flex items-stretch gap-2">
            {/* Listing Type Filter Tabs - Full width on mobile, auto on desktop */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-full sm:w-auto">
              <button
                onClick={() => onListingTypeChange('all')}
                className={cn(
                  "flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap",
                  listingTypeFilter === 'all'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">All Listings</span>
                <span className="xs:hidden">All</span>
              </button>
              
              <button
                onClick={() => onListingTypeChange('stores')}
                className={cn(
                  "flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap",
                  listingTypeFilter === 'stores'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Stores
              </button>
              
              <button
                onClick={() => onListingTypeChange('individuals')}
                className={cn(
                  "flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap",
                  listingTypeFilter === 'individuals'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Private Sellers</span>
                <span className="xs:hidden">Private</span>
              </button>
            </div>

            {/* Additional Filters Slot (e.g., AdvancedFilters) - Matches height exactly */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
              {additionalFilters}
            </div>

            {/* Product Count */}
            {productCount !== undefined && (
              <span className="hidden lg:flex items-center text-sm text-gray-500 font-medium tabular-nums whitespace-nowrap">
                {productCount.toLocaleString()} items
              </span>
            )}
          </div>
        )}
      </div>

      {/* Category Navigation - Only on Browse mode */}
      <AnimatePresence mode="wait">
        {isOnBrowseMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            {/* Breadcrumb Trail - Compact, clickable */}
            {breadcrumbs.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 mb-2.5 overflow-x-auto scrollbar-hide"
              >
                <button
                  onClick={clearAllCategories}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  All Categories
                </button>
                
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.label}>
                    <ChevronRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
                    <button
                      onClick={crumb.onClick}
                      disabled={index === breadcrumbs.length - 1}
                      className={cn(
                        "flex items-center px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
                        index === breadcrumbs.length - 1
                          ? "text-gray-900 bg-gray-100"
                          : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                      )}
                    >
                      {crumb.label}
                    </button>
                  </React.Fragment>
                ))}
                
                {/* Clear button */}
                <button
                  onClick={clearAllCategories}
                  className="ml-1 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                  aria-label="Clear filters"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}

            {/* Category Pills */}
            {loading ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Loading...</span>
              </div>
            ) : (
              <motion.div
                key={`${selectedLevel1}-${selectedLevel2}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1"
              >
                {categoryOptions.map((option) => {
                  const Icon = 'icon' in option ? option.icon : undefined;
                  
                  return (
                    <button
                      key={option.name}
                      onClick={() => handleCategorySelect(option)}
                      onMouseEnter={() => {
                        if (!option.isActive && option.level === 1) {
                          prefetchCategoryProducts(option.name);
                        }
                      }}
                      className={cn(
                        "group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-md font-medium transition-all whitespace-nowrap flex-shrink-0 cursor-pointer",
                        option.isActive
                          ? "bg-gray-900 text-white shadow-md"
                          : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
                      )}
                    >
                      {Icon && (
                        <Icon className={cn(
                          "h-4 w-4 sm:h-5 sm:w-5 transition-colors",
                          option.isActive ? "text-white" : "text-gray-500 group-hover:text-gray-700"
                        )} />
                      )}
                      <span className="text-xs sm:text-sm">{option.name}</span>
                      {option.count > 0 && (
                        <span className={cn(
                          "text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md font-medium transition-colors",
                          option.isActive
                            ? "bg-white/20 text-white"
                            : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                        )}>
                          {option.count.toLocaleString()}
                        </span>
                      )}
                      {'hasChildren' in option && option.hasChildren && !option.isActive && (
                        <ChevronRight className="h-3 w-3 text-gray-400 -mr-1" />
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

