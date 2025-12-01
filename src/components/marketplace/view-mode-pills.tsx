"use client";

import * as React from "react";
import { TrendingUp, Heart, Package } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// View Mode Pills
// Switch between Trending, For You, and All Products
// ============================================================

export type ViewMode = 'trending' | 'for-you' | 'all';

interface ViewModePillsProps {
  activeMode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  showForYouBadge?: boolean; // Show "Sign in" badge for anonymous users
}

export function ViewModePills({ 
  activeMode, 
  onModeChange,
  showForYouBadge = false 
}: ViewModePillsProps) {
  return (
    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
      {/* Trending Pill */}
      <button
        onClick={() => onModeChange('trending')}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
          activeMode === 'trending'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <TrendingUp size={15} />
        Trending
      </button>

      {/* For You Pill */}
      <button
        onClick={() => onModeChange('for-you')}
        className={cn(
          "relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
          activeMode === 'for-you'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <Heart size={15} />
        For You
        {showForYouBadge && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#FFC72C] rounded-full" />
        )}
      </button>

      {/* All Products Pill */}
      <button
        onClick={() => onModeChange('all')}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
          activeMode === 'all'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <Package size={15} />
        All Products
      </button>
    </div>
  );
}

