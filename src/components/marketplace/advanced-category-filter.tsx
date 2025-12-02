"use client";

import * as React from "react";
import {
  Bike,
  Zap,
  Box,
  Disc,
  Cog,
  Grip,
  Armchair,
  CircleDot,
  Shield,
  Wrench,
  Laptop,
  Apple,
  Store,
  Tag,
  ChevronLeft,
  Package,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Advanced Category Filter
// 3-level hierarchical filtering with smooth animations
// Dynamically fetches categories from the database
// ============================================================

interface AdvancedCategoryFilterProps {
  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onLevel1Change: (level1: string | null) => void;
  onLevel2Change: (level2: string | null) => void;
  onLevel3Change: (level3: string | null) => void;
  counts?: Record<string, number>; // Optional: category counts
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

// Icon mapping for Level 1 categories
const LEVEL1_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Bicycles": Bike,
  "E-Bikes": Zap,
  "Frames & Framesets": Box,
  "Wheels & Tyres": Disc,
  "Drivetrain": Cog,
  "Brakes": Disc,
  "Cockpit": Grip,
  "Seat & Seatposts": Armchair,
  "Pedals": CircleDot,
  "Accessories": Shield,
  "Apparel": Shield,
  "Protection": Shield,
  "Maintenance & Workshop": Wrench,
  "Tech & Electronics": Laptop,
  "Nutrition": Apple,
  "Shop Services": Store,
  "Marketplace Specials": Tag,
};

// Default icon for unknown categories
const getCategoryIcon = (categoryName: string) => {
  return LEVEL1_ICONS[categoryName] || Package;
};

export function AdvancedCategoryFilter({
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onLevel1Change,
  onLevel2Change,
  onLevel3Change,
  counts = {},
}: AdvancedCategoryFilterProps) {
  const [categories, setCategories] = React.useState<CategoryHierarchy[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Fetch categories from API
  React.useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/marketplace/categories');
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch (error) {
        console.error('[AdvancedCategoryFilter] Error fetching categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const selectedCategory = categories.find(c => c.level1 === selectedLevel1);
  const level2Categories = selectedCategory?.level2Categories || [];
  const selectedLevel2Category = level2Categories.find(l2 => l2.name === selectedLevel2);
  const level3Categories = selectedLevel2Category?.level3Categories || [];

  const handleLevel1Click = (level1: string) => {
    if (selectedLevel1 === level1) {
      // Deselect and clear all
      onLevel1Change(null);
      onLevel2Change(null);
      onLevel3Change(null);
    } else {
      // Select new Level 1 and clear downstream
      onLevel1Change(level1);
      onLevel2Change(null);
      onLevel3Change(null);
    }
  };

  const handleLevel2Click = (level2: string) => {
    if (selectedLevel2 === level2) {
      // Deselect Level 2 and clear Level 3
      onLevel2Change(null);
      onLevel3Change(null);
    } else {
      // Select new Level 2 and clear Level 3
      onLevel2Change(level2);
      onLevel3Change(null);
    }
  };

  const handleLevel3Click = (level3: string) => {
    if (selectedLevel3 === level3) {
      onLevel3Change(null);
    } else {
      onLevel3Change(level3);
    }
  };

  const clearAll = () => {
    onLevel1Change(null);
    onLevel2Change(null);
    onLevel3Change(null);
  };

  return (
    <div className="space-y-4">
      {/* Category Pills - All levels on the same line */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Browse by Category</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {/* Show Level 3 if selected */}
          {selectedLevel1 && selectedLevel2 && level3Categories.length > 0 ? (
            <>
              {/* Back button to Level 2 */}
              <button
                onClick={() => onLevel3Change(null)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md transition-all whitespace-nowrap text-gray-700 bg-gray-100 hover:bg-gray-200/70 flex-shrink-0 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              {/* Level 3 Pills */}
              {level3Categories.map((level3) => {
                const isActive = selectedLevel3 === level3.name;

                return (
                  <button
                    key={level3.name}
                    onClick={() => handleLevel3Click(level3.name)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                      isActive
                        ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                        : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                    )}
                  >
                    {level3.name}
                    {level3.count > 0 && (
                      <span className="text-xs text-gray-500">({level3.count})</span>
                    )}
                  </button>
                );
              })}
            </>
          ) : selectedLevel1 && level2Categories.length > 0 ? (
            <>
              {/* Back button to Level 1 */}
              <button
                onClick={() => {
                  onLevel1Change(null);
                  onLevel2Change(null);
                  onLevel3Change(null);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md transition-all whitespace-nowrap text-gray-700 bg-gray-100 hover:bg-gray-200/70 flex-shrink-0 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              {/* Level 2 Pills */}
              {level2Categories.map((level2) => {
                const isActive = selectedLevel2 === level2.name;

                return (
                  <button
                    key={level2.name}
                    onClick={() => handleLevel2Click(level2.name)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                      isActive
                        ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                        : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                    )}
                  >
                    {level2.name}
                    {level2.count > 0 && (
                      <span className="text-xs text-gray-500">({level2.count})</span>
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {/* All Products */}
              <button
                onClick={clearAll}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                  !selectedLevel1
                    ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                    : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                )}
              >
                All Products
              </button>

              {/* Level 1 Pills */}
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  <span className="text-sm text-gray-500">Loading...</span>
                </div>
              ) : (
                categories.map((category) => {
                  const level1 = category.level1;
                  const Icon = getCategoryIcon(level1);
                  const isActive = selectedLevel1 === level1;
                  const count = category.totalProducts;

                  return (
                    <button
                      key={level1}
                      onClick={() => handleLevel1Click(level1)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                        isActive
                          ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                          : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {level1}
                      {count > 0 && (
                        <span className="text-xs text-gray-500">({count})</span>
                      )}
                    </button>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

