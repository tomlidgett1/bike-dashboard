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
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-3">
          {/* Main Tab Container - For Sale / Sold */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              <button
                onClick={() => {
                  onTabSelect('for-sale');
                  onCategorySelect(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  selectedTab === 'for-sale'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <ShoppingBag size={15} />
                For Sale
                <span className="text-gray-500 ml-1">({forSaleCount})</span>
              </button>
              <button
                onClick={() => {
                  onTabSelect('sold');
                  onCategorySelect(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  selectedTab === 'sold'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <CheckCircle size={15} />
                Sold
                <span className="text-gray-500 ml-1">({soldCount})</span>
              </button>
            </div>
          </div>

          {/* Category Pills */}
          {currentCategories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {/* All Items */}
              <button
                onClick={() => onCategorySelect(null)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                  selectedCategory === null
                    ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                    : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                )}
              >
                <Package className="h-4 w-4" />
                All
              </button>

              {/* Category Pills */}
              {currentCategories.map((category) => {
                const Icon = getCategoryIcon(category.display_name);
                return (
                  <button
                    key={category.id}
                    onClick={() => onCategorySelect(category.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      selectedCategory === category.id
                        ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                        : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {category.display_name}
                    <span className="text-gray-500">({category.product_count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
