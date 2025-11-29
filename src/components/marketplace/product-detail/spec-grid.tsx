"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ============================================================
// Spec Grid Component
// For displaying specifications in a clean grid
// ============================================================

interface SpecItem {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
}

interface SpecGridProps {
  title?: string;
  items: SpecItem[];
  columns?: 1 | 2;
  className?: string;
}

export function SpecGrid({ title, items, columns = 2, className }: SpecGridProps) {
  // Filter out items with no value
  const validItems = items.filter((item) => item.value !== undefined && item.value !== null && item.value !== "");

  if (validItems.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {title && <h4 className="text-sm font-semibold text-gray-900">{title}</h4>}
      <div
        className={cn(
          "grid gap-x-6 gap-y-2",
          columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {validItems.map((item, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{item.label}:</span>
            <span
              className={cn(
                "text-sm font-medium text-right",
                item.highlight ? "text-gray-900 font-semibold" : "text-gray-900"
              )}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Spec Group - For grouped specifications (e.g., Frame, Components)
// ============================================================

interface SpecGroupProps {
  title: string;
  items: SpecItem[];
  className?: string;
}

export function SpecGroup({ title, items, className }: SpecGroupProps) {
  const validItems = items.filter((item) => item.value !== undefined && item.value !== null && item.value !== "");

  if (validItems.length === 0) return null;

  return (
    <div className={cn("bg-gray-50 rounded-md p-4 border border-gray-200", className)}>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">{title}</h4>
      <div className="space-y-2">
        {validItems.map((item, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{item.label}:</span>
            <span className="text-sm font-medium text-gray-900 text-right">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

