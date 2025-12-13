"use client";

import * as React from "react";
import {
  Package,
  AlertTriangle,
  RefreshCw,
  Truck,
  HelpCircle,
  Ban,
  PackageX,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface Category {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

interface HelpStepCategoryProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

// ============================================================
// Category Data
// ============================================================

const CATEGORIES: Category[] = [
  {
    id: "item_not_received",
    label: "Item not received",
    description: "I haven't received my order yet",
    icon: Package,
  },
  {
    id: "item_not_as_described",
    label: "Not as described",
    description: "The item doesn't match the listing",
    icon: AlertTriangle,
  },
  {
    id: "damaged",
    label: "Damaged item",
    description: "The item arrived broken or damaged",
    icon: PackageX,
  },
  {
    id: "wrong_item",
    label: "Wrong item",
    description: "I received a different item",
    icon: Ban,
  },
  {
    id: "refund_request",
    label: "Refund request",
    description: "I'd like to return this item",
    icon: RefreshCw,
  },
  {
    id: "shipping_issue",
    label: "Shipping problem",
    description: "Issues with tracking or delivery",
    icon: Truck,
  },
  {
    id: "general_question",
    label: "General question",
    description: "Other questions about my order",
    icon: HelpCircle,
  },
];

// ============================================================
// Component
// ============================================================

export function HelpStepCategory({
  selectedCategory,
  onSelectCategory,
}: HelpStepCategoryProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 mb-4">
        Select the category that best describes your issue
      </p>
      
      <div className="space-y-2">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          const isSelected = selectedCategory === category.id;

          return (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-md border-2 transition-all text-left",
                "bg-white hover:bg-gray-50 active:bg-gray-100",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <div
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                  isSelected ? "bg-primary/10" : "bg-gray-100"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isSelected ? "text-primary" : "text-gray-600"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "font-medium",
                    isSelected ? "text-primary" : "text-gray-900"
                  )}
                >
                  {category.label}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {category.description}
                </p>
              </div>
              <div
                className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all",
                  isSelected
                    ? "border-primary bg-primary"
                    : "border-gray-300 bg-white"
                )}
              >
                {isSelected && (
                  <svg
                    className="w-full h-full text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

