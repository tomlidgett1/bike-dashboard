"use client";

import * as React from "react";
import { 
  Bike, 
  Settings, 
  Shirt, 
  Apple, 
  Package,
  ShoppingBag,
  CheckCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellerCategory } from "@/app/api/marketplace/seller/[sellerId]/route";

// ============================================================
// Seller Categories with Icons
// Tab-style navigation with For Sale/Sold + category filters
// ============================================================

// Map category names to icons
const getCategoryIcon = (categoryName: string): React.ComponentType<{ className?: string }> => {
  const name = categoryName.toLowerCase();
  if (name.includes('bicycle') || name.includes('bike')) return Bike;
  if (name.includes('part') || name.includes('component')) return Settings;
  if (name.includes('apparel') || name.includes('clothing') || name.includes('jersey')) return Shirt;
  if (name.includes('nutrition') || name.includes('food')) return Apple;
  return Package;
};

type ListingTab = 'for-sale' | 'sold';

interface SellerCategoriesProps {
  categories: SellerCategory[];
  soldCategories: SellerCategory[];
  selectedTab: ListingTab;
  selectedCategory: string | null;
  onTabSelect: (tab: ListingTab) => void;
  onCategorySelect: (categoryId: string | null) => void;
  className?: string;
}

export function SellerCategories({
  categories,
  soldCategories,
  selectedTab,
  selectedCategory,
  onTabSelect,
  onCategorySelect,
  className,
}: SellerCategoriesProps) {
  // Total product counts
  const forSaleCount = React.useMemo(() => {
    return categories.reduce((sum, cat) => sum + cat.product_count, 0);
  }, [categories]);

  const soldCount = React.useMemo(() => {
    return soldCategories.reduce((sum, cat) => sum + cat.product_count, 0);
  }, [soldCategories]);

  // Get current categories based on selected tab
  const currentCategories = selectedTab === 'for-sale' ? categories : soldCategories;

  return (
    <div className={cn("bg-white border-b border-gray-100 sticky top-16 z-30", className)}>
      <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="py-2.5 sm:py-3">
          {/* Main Tab Container - For Sale / Sold */}
          <div className="flex items-center gap-4 mb-2.5 sm:mb-3">
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              <button
                onClick={() => {
                  onTabSelect('for-sale');
                  onCategorySelect(null);
                }}
                className={cn(
                  "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                  selectedTab === 'for-sale'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>For Sale</span>
                <span className="text-gray-500 ml-0.5 sm:ml-1">({forSaleCount})</span>
              </button>
              <button
                onClick={() => {
                  onTabSelect('sold');
                  onCategorySelect(null);
                }}
                className={cn(
                  "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                  selectedTab === 'sold'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>Sold</span>
                <span className="text-gray-500 ml-0.5 sm:ml-1">({soldCount})</span>
              </button>
            </div>
          </div>

          {/* Category Pills - Mobile Optimised Horizontal Scroll */}
          {currentCategories.length > 0 && (
            <div className="relative -mx-3 sm:mx-0">
              {/* Fade gradient at the end on mobile */}
              <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10 sm:hidden" />
              
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide px-3 sm:px-0 snap-x snap-mandatory sm:snap-none">
                {/* All Items */}
                <button
                  onClick={() => onCategorySelect(null)}
                  className={cn(
                    "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 snap-start",
                    selectedCategory === null
                      ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                      : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                  )}
                >
                  <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span>All</span>
                </button>

                {/* Category Pills */}
                {currentCategories.map((category) => {
                  const Icon = getCategoryIcon(category.display_name);
                  return (
                    <button
                      key={category.id}
                      onClick={() => onCategorySelect(category.id)}
                      className={cn(
                        "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 snap-start",
                        selectedCategory === category.id
                          ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                          : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span>{category.display_name}</span>
                      <span className="text-gray-500">({category.product_count})</span>
                    </button>
                  );
                })}
                {/* Spacer for mobile scroll end */}
                <div className="w-3 flex-shrink-0 sm:hidden" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
