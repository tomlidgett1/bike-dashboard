"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Store Category Pills
// Zero-latency category filtering for store products
// Categories derived client-side from already-fetched products
// ============================================================

interface StoreCategory {
  name: string;
  count: number;
}

interface StoreCategoryPillsProps {
  categories: StoreCategory[];
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  className?: string;
}

export function StoreCategoryPills({
  categories,
  selectedCategory,
  onCategoryChange,
  className,
}: StoreCategoryPillsProps) {
  if (categories.length === 0) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
      className={cn("overflow-hidden", className)}
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mt-2 -mx-1 px-1">
        {/* All Products Pill */}
        <button
          onClick={() => onCategoryChange(null)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer",
            selectedCategory === null
              ? "text-gray-800 bg-white shadow-sm border border-gray-200"
              : "text-gray-600 bg-gray-100 hover:bg-gray-200"
          )}
        >
          <Package className="h-4 w-4" />
          <span>All Products</span>
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

        {/* Category Pills */}
        {categories.map((category) => {
          const isSelected = selectedCategory === category.name;
          
          return (
            <motion.button
              key={category.name}
              onClick={() => onCategoryChange(isSelected ? null : category.name)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer",
                isSelected
                  ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                  : "text-gray-600 bg-gray-100 hover:bg-gray-200"
              )}
            >
              <span>{category.name}</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-md font-medium",
                isSelected
                  ? "bg-gray-100 text-gray-600"
                  : "bg-gray-200/70 text-gray-500"
              )}>
                {category.count.toLocaleString()}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

