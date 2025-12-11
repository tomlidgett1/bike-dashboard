"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Condition Badge Component
// ============================================================

interface ConditionBadgeProps {
  condition: string;
  showStars?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ConditionBadge({ condition, showStars = true, size = "md" }: ConditionBadgeProps) {
  const getRating = (condition: string): number => {
    const ratings: Record<string, number> = {
      "New": 6,
      "Like New": 5,
      "Excellent": 5,
      "Good": 4,
      "Fair": 3,
      "Well Used": 2,
    };
    return ratings[condition] || 3;
  };

  const getColor = (condition: string): string => {
    const colors: Record<string, string> = {
      "New": "bg-green-100 text-green-800 border-green-200",
      "Like New": "bg-green-100 text-green-800 border-green-200",
      "Excellent": "bg-emerald-100 text-emerald-800 border-emerald-200",
      "Good": "bg-blue-100 text-blue-800 border-blue-200",
      "Fair": "bg-yellow-100 text-yellow-800 border-yellow-200",
      "Well Used": "bg-orange-100 text-orange-800 border-orange-200",
    };
    return colors[condition] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const rating = getRating(condition);

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center font-medium rounded-md border",
          getColor(condition),
          sizeClasses[size]
        )}
      >
        {condition}
      </span>
      {showStars && (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                "h-3.5 w-3.5",
                i < rating
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-gray-200 text-gray-200"
              )}
            />
          ))}
          <span className="text-xs text-gray-600 ml-1">({rating}/6)</span>
        </div>
      )}
    </div>
  );
}







