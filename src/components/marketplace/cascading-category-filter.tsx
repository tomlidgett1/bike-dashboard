"use client";

import * as React from "react";
import { Bike, Settings, Shirt, Apple, ChevronDown, Package, Loader2, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { preload } from "swr";

// ============================================================
// Cascading Category Filter
// Shows L1 categories, expands to L2, then L3
// Dynamically fetches categories from the database
// With hover-based prefetching for instant category switching
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
  
  // Use SWR preload for intelligent caching
  preload(url, (url: string) => fetch(url).then(res => res.json()));
};

interface CascadingCategoryFilterProps {
  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onLevel1Change: (category: string | null) => void;
  onLevel2Change: (subcategory: string | null) => void;
  onLevel3Change: (level3: string | null) => void;
  counts?: Record<string, number>;
  /** Filter categories by listing type: 'all' | 'stores' | 'individuals' */
  listingTypeFilter?: 'all' | 'stores' | 'individuals';
}

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

// Default icon mapping for common categories
const getCategoryIcon = (categoryName: string) => {
  const name = categoryName.toLowerCase();
  if (name.includes('bike') || name.includes('bicycle')) return Bike;
  if (name.includes('apparel') || name.includes('clothing')) return Shirt;
  if (name.includes('nutrition') || name.includes('food')) return Apple;
  if (name.includes('part') || name.includes('component')) return Settings;
  return Package;
};

export function CascadingCategoryFilter({
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onLevel1Change,
  onLevel2Change,
  onLevel3Change,
  counts,
  listingTypeFilter = 'all',
}: CascadingCategoryFilterProps) {
  const [categories, setCategories] = React.useState<CategoryHierarchy[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Fetch categories from API - re-fetch when listing type filter changes
  React.useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      try {
        // Build URL with listing type filter
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
        console.error('[CategoryFilter] Error fetching categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, [listingTypeFilter]);
  // Level 1 Category Pills
  const renderLevel1 = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Loading categories...</span>
        </div>
      );
    }

    return (
      <motion.div
        key="level1"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ 
          duration: 0.3,
          ease: [0.04, 0.62, 0.23, 0.98]
        }}
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((category) => {
            const name = category.level1;
            const Icon = getCategoryIcon(name);
            const isActive = selectedLevel1 === name;
            const count = category.totalProducts;

            return (
              <button
                key={name}
                onClick={() => {
                  // Select L1, clear L2/L3
                  onLevel1Change(name);
                  onLevel2Change(null);
                  onLevel3Change(null);
                }}
                onMouseEnter={() => {
                  // Prefetch products for this category on hover
                  if (!isActive) {
                    prefetchCategoryProducts(name);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-md font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 cursor-pointer",
                  isActive
                    ? "bg-white text-gray-800 shadow-md border border-gray-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:shadow-sm"
                )}
              >
                <Icon 
                  className={cn(
                    "h-5 w-5 transition-colors",
                    isActive ? "text-gray-700" : "text-gray-500"
                  )} 
                />
                <span className="text-sm">{name}</span>
                {count > 0 && (
                  <span 
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded-md font-medium",
                      isActive 
                        ? "bg-gray-100 text-gray-600"
                        : "bg-gray-200 text-gray-600"
                    )}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  };

  // Level 2 Subcategory Pills (shown when L1 is selected)
  const renderLevel2 = () => {
    if (!selectedLevel1) return null;

    const selectedCategory = categories.find(c => c.level1 === selectedLevel1);
    if (!selectedCategory || selectedCategory.level2Categories.length === 0) return null;

    return (
      <motion.div
        key="level2"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ 
          duration: 0.3,
          ease: [0.04, 0.62, 0.23, 0.98]
        }}
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {/* Back Button */}
          <button
            onClick={() => {
              onLevel1Change(null);
              onLevel2Change(null);
              onLevel3Change(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap flex-shrink-0 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {selectedCategory.level2Categories.map((level2) => {
            const isActive = selectedLevel2 === level2.name;
            const count = level2.count;
            const hasLevel3 = level2.level3Categories.length > 0;

            return (
              <button
                key={level2.name}
                onClick={() => {
                  if (isActive) {
                    // Deselect L2, clear L3
                    onLevel2Change(null);
                    onLevel3Change(null);
                  } else {
                    // Select new L2, clear L3
                    onLevel2Change(level2.name);
                    onLevel3Change(null);
                  }
                }}
                onMouseEnter={() => {
                  // Prefetch products for this subcategory on hover
                  if (!isActive && selectedLevel1) {
                    prefetchCategoryProducts(selectedLevel1, level2.name);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 cursor-pointer",
                  isActive
                    ? "bg-gray-800 text-white shadow-sm"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                )}
              >
                {level2.name}
                {count > 0 && (
                  <span 
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded-md font-medium",
                      isActive 
                        ? "bg-gray-700 text-gray-200"
                        : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {count}
                  </span>
                )}
                {hasLevel3 && (
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  };

  // Level 3 Category Pills (shown when L2 is selected)
  const renderLevel3 = () => {
    if (!selectedLevel1 || !selectedLevel2) return null;

    const selectedCategory = categories.find(c => c.level1 === selectedLevel1);
    if (!selectedCategory) return null;

    const selectedLevel2Category = selectedCategory.level2Categories.find(
      l2 => l2.name === selectedLevel2
    );
    if (!selectedLevel2Category || selectedLevel2Category.level3Categories.length === 0) return null;

    return (
      <motion.div
        key="level3"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ 
          duration: 0.3,
          ease: [0.04, 0.62, 0.23, 0.98]
        }}
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {/* Back Button */}
          <button
            onClick={() => {
              onLevel3Change(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap flex-shrink-0 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {selectedLevel2Category.level3Categories.map((level3) => {
            const isActive = selectedLevel3 === level3.name;
            const count = level3.count;

            return (
              <button
                key={level3.name}
                onClick={() => {
                  onLevel3Change(isActive ? null : level3.name);
                }}
                onMouseEnter={() => {
                  // Prefetch products for this L3 category on hover
                  if (!isActive && selectedLevel1 && selectedLevel2) {
                    prefetchCategoryProducts(selectedLevel1, selectedLevel2, level3.name);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 cursor-pointer",
                  isActive
                    ? "bg-[#FFC72C] text-gray-900 shadow-sm"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                )}
              >
                {level3.name}
                {count > 0 && (
                  <span 
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded-md font-medium",
                      isActive 
                        ? "bg-[#E6B328] text-gray-900"
                        : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Breadcrumb / Clear All - Show when any filter is active */}
      {(selectedLevel1 || selectedLevel2 || selectedLevel3) && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <button
            onClick={() => {
              onLevel1Change(null);
              onLevel2Change(null);
              onLevel3Change(null);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-gray-100 transition-colors text-gray-700 font-medium cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            View All Categories
          </button>
          <span className="text-gray-400">/</span>
          <span className="text-gray-700">{selectedLevel1}</span>
          {selectedLevel2 && (
            <>
              <span className="text-gray-400">/</span>
              <span className="text-gray-700">{selectedLevel2}</span>
            </>
          )}
          {selectedLevel3 && (
            <>
              <span className="text-gray-400">/</span>
              <span className="text-gray-700">{selectedLevel3}</span>
            </>
          )}
        </div>
      )}

      {/* Show Level 3 if Level 2 is selected */}
      <AnimatePresence mode="wait">
        {selectedLevel1 && selectedLevel2 ? (
          renderLevel3()
        ) : selectedLevel1 ? (
          /* Show Level 2 if Level 1 is selected */
          renderLevel2()
        ) : (
          /* Show Level 1 by default */
          renderLevel1()
        )}
      </AnimatePresence>
    </div>
  );
}

