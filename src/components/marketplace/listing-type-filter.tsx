"use client";

import * as React from "react";
import { Store, User, Grid } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Listing Type Filter
// Switch between All Listings, Stores, and Individual Sellers
// Mobile-optimised with smaller text
// ============================================================

export type ListingTypeFilter = 'all' | 'stores' | 'individuals';

interface ListingTypeFilterProps {
  activeFilter: ListingTypeFilter;
  onFilterChange: (filter: ListingTypeFilter) => void;
}

export function ListingTypeFilter({ 
  activeFilter, 
  onFilterChange 
}: ListingTypeFilterProps) {
  return (
    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit flex-shrink-0">
      {/* All Listings */}
      <button
        onClick={() => onFilterChange('all')}
        className={cn(
          "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap",
          activeFilter === 'all'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <Grid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        All
      </button>

      {/* Stores */}
      <button
        onClick={() => onFilterChange('stores')}
        className={cn(
          "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap",
          activeFilter === 'stores'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        Stores
      </button>

      {/* Individual Sellers */}
      <button
        onClick={() => onFilterChange('individuals')}
        className={cn(
          "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap",
          activeFilter === 'individuals'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">Sellers</span>
        <span className="sm:hidden">Private</span>
      </button>
    </div>
  );
}

