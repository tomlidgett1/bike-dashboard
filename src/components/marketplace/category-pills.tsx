"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { BikeIcon, getCategoryIconName } from "@/components/ui/bike-icon";

// ============================================================
// Category Pills
// Large visual pills for Level 1 categories
// ============================================================

interface CategoryPillsProps {
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  counts?: Record<string, number>; // Category counts for display
}

const CATEGORIES = [
  { name: 'Bicycles' },
  { name: 'Parts' },
  { name: 'Apparel' },
  { name: 'Nutrition' },
] as const;

export function CategoryPills({ 
  selectedCategory, 
  onCategoryChange,
  counts 
}: CategoryPillsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CATEGORIES.map(({ name }) => {
        const isActive = selectedCategory === name;
        const count = counts?.[name] || 0;
        const iconName = getCategoryIconName(name);

        return (
          <button
            key={name}
            onClick={() => onCategoryChange(isActive ? null : name)}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md font-medium transition-all duration-200 cursor-pointer",
              isActive
                ? "bg-white text-gray-800 shadow-md border border-gray-200"
                : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:shadow-sm"
            )}
          >
            <BikeIcon 
              iconName={iconName}
              size={20}
              className={cn(
                "transition-opacity",
                isActive ? "opacity-100" : "opacity-60"
              )} 
            />
            <span className="text-sm">{name}</span>
            {count > 0 && (
              <span 
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-md font-medium",
                  isActive 
                    ? "bg-gray-100 text-gray-600"
                    : "bg-gray-200 text-gray-600"
                )}
              >
                {count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

