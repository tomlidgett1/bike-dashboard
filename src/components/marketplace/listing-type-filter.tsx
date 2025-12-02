"use client";

import * as React from "react";
import { Store, User, Grid } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Listing Type Filter
// Switch between All Listings, Stores, and Individual Sellers
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
    <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
      {/* All Listings */}
      <button
        onClick={() => onFilterChange('all')}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
          activeFilter === 'all'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <Grid size={15} />
        All Listings
      </button>

      {/* Stores */}
      <button
        onClick={() => onFilterChange('stores')}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
          activeFilter === 'stores'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <Store size={15} />
        Stores
      </button>

      {/* Individual Sellers */}
      <button
        onClick={() => onFilterChange('individuals')}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
          activeFilter === 'individuals'
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70"
        )}
      >
        <User size={15} />
        Individual Sellers
      </button>
    </div>
  );
}

