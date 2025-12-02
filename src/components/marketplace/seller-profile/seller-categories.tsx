"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SellerCategory } from "@/app/api/marketplace/seller/[sellerId]/route";

// ============================================================
// Seller Categories (Horizontal scrolling pills)
// Depop-style category filter for seller profiles
// ============================================================

interface SellerCategoriesProps {
  categories: SellerCategory[];
  selectedCategory: string | null;
  onCategorySelect: (categoryId: string | null) => void;
  className?: string;
}

export function SellerCategories({
  categories,
  selectedCategory,
  onCategorySelect,
  className,
}: SellerCategoriesProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Total product count across all categories
  const totalProducts = React.useMemo(() => {
    return categories.reduce((sum, cat) => sum + cat.product_count, 0);
  }, [categories]);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className={cn("bg-white border-b border-gray-100 sticky top-16 z-30", className)}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="relative py-3">
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto scrollbar-hide -mx-2 px-2"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <div className="flex gap-2 pb-1" style={{ minWidth: 'min-content' }}>
              {/* All Items */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onCategorySelect(null)}
                className={cn(
                  "flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  selectedCategory === null
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                All Items
                <span className="ml-1.5 opacity-70">({totalProducts})</span>
              </motion.button>

              {/* Category Pills */}
              {categories.map((category) => (
                <motion.button
                  key={category.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onCategorySelect(category.id)}
                  className={cn(
                    "flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                    selectedCategory === category.id
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  {category.display_name}
                  <span className="ml-1.5 opacity-70">({category.product_count})</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Fade edges for scroll indication */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

