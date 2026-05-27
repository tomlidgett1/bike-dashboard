"use client";

import * as React from "react";
import { TrendingUp, Package } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// View Mode Pills
// Switch between Trending and All Products
// Mobile-optimised with smaller text and horizontal scroll
// ============================================================

export type ViewMode = 'trending' | 'all';

interface ViewModePillsProps {
  activeMode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

export function ViewModePills({ 
  activeMode, 
  onModeChange,
}: ViewModePillsProps) {
  return (
    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit flex-shrink-0">
      <button
        onClick={() => onModeChange('trending')}
        className={cn(
          "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap",
          activeMode === 'trending'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden xs:inline">Trending</span>
        <span className="xs:hidden">Hot</span>
      </button>

      <button
        onClick={() => onModeChange('all')}
        className={cn(
          "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap",
          activeMode === 'all'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        All
      </button>
    </div>
  );
}
