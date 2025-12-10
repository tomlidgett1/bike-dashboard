"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MarketplaceCategory } from "@/lib/types/marketplace";
import { MARKETPLACE_SUBCATEGORIES } from "@/lib/types/marketplace";
import { BikeIcon, getCategoryIconName } from "@/components/ui/bike-icon";

// ============================================================
// Category Filters
// Animated pill filters with subcategory dropdowns
// ============================================================

interface CategoryFiltersProps {
  selectedCategory: MarketplaceCategory | null;
  selectedSubcategory: string | null;
  onCategoryChange: (category: MarketplaceCategory | null) => void;
  onSubcategoryChange: (subcategory: string | null) => void;
  categoryCounts?: Record<MarketplaceCategory, number>;
}

export function CategoryFilters({
  selectedCategory,
  selectedSubcategory,
  onCategoryChange,
  onSubcategoryChange,
  categoryCounts = {} as Record<MarketplaceCategory, number>,
}: CategoryFiltersProps) {
  const [expandedCategory, setExpandedCategory] = React.useState<MarketplaceCategory | null>(
    selectedCategory
  );

  const categories: MarketplaceCategory[] = ['Bicycles', 'Parts', 'Apparel', 'Nutrition'];

  const handleCategoryClick = (category: MarketplaceCategory) => {
    if (selectedCategory === category) {
      // Deselect if clicking the same category
      onCategoryChange(null);
      onSubcategoryChange(null);
      setExpandedCategory(null);
    } else {
      // Select new category
      onCategoryChange(category);
      onSubcategoryChange(null); // Reset subcategory
      setExpandedCategory(category);
    }
  };

  const handleSubcategoryClick = (subcategory: string) => {
    if (selectedSubcategory === subcategory) {
      onSubcategoryChange(null);
    } else {
      onSubcategoryChange(subcategory);
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {/* All Categories Pill */}
        <button
          onClick={() => {
            onCategoryChange(null);
            onSubcategoryChange(null);
            setExpandedCategory(null);
          }}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
            !selectedCategory
              ? "text-gray-800 bg-white shadow-sm border border-gray-200"
              : "text-gray-600 bg-gray-100 hover:bg-gray-200/70 border border-transparent"
          )}
        >
          All Products
        </button>

        {/* Category Pills */}
        {categories.map((category) => {
          const iconName = getCategoryIconName(category);
          const count = categoryCounts[category] || 0;
          const isActive = selectedCategory === category;

          return (
            <button
              key={category}
              onClick={() => handleCategoryClick(category)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                isActive
                  ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                  : "text-gray-600 bg-gray-100 hover:bg-gray-200/70 border border-transparent"
              )}
            >
              <BikeIcon iconName={iconName} size={16} className={isActive ? "opacity-100" : "opacity-60"} />
              {category}
              {count > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 rounded-md bg-gray-200 text-gray-700 text-xs px-1.5 py-0"
                >
                  {count}
                </Badge>
              )}
              {isActive && (
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-gray-400 transition-transform duration-200",
                    expandedCategory === category && "rotate-180"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Subcategory Pills (Animated Dropdown) */}
      <AnimatePresence>
        {selectedCategory && expandedCategory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500 font-medium mr-2">
                Filter by:
              </span>

              {/* All in Category */}
              <button
                onClick={() => onSubcategoryChange(null)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                  !selectedSubcategory
                    ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                    : "text-gray-600 bg-gray-100 hover:bg-gray-200/70 border border-transparent"
                )}
              >
                All {selectedCategory}
              </button>

              {/* Subcategory Pills */}
              {MARKETPLACE_SUBCATEGORIES[selectedCategory].map((subcategory) => {
                const isActive = selectedSubcategory === subcategory;

                return (
                  <button
                    key={subcategory}
                    onClick={() => handleSubcategoryClick(subcategory)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer",
                      isActive
                        ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                        : "text-gray-600 bg-gray-100 hover:bg-gray-200/70 border border-transparent"
                    )}
                  >
                    {subcategory}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

