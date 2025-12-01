"use client";

import * as React from "react";
import { Bike, Settings, Shirt, Apple } from "lucide-react";
import { cn } from "@/lib/utils";

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
  { name: 'Bicycles', icon: Bike, color: 'text-blue-600' },
  { name: 'Parts', icon: Settings, color: 'text-gray-600' },
  { name: 'Apparel', icon: Shirt, color: 'text-purple-600' },
  { name: 'Nutrition', icon: Apple, color: 'text-green-600' },
] as const;

export function CategoryPills({ 
  selectedCategory, 
  onCategoryChange,
  counts 
}: CategoryPillsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CATEGORIES.map(({ name, icon: Icon, color }) => {
        const isActive = selectedCategory === name;
        const count = counts?.[name] || 0;

        return (
          <button
            key={name}
            onClick={() => onCategoryChange(isActive ? null : name)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-md font-medium transition-all duration-200",
              isActive
                ? "bg-white text-gray-800 shadow-md border border-gray-200"
                : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:shadow-sm"
            )}
          >
            <Icon 
              className={cn(
                "h-5 w-5 transition-colors",
                isActive ? color : "text-gray-500"
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

