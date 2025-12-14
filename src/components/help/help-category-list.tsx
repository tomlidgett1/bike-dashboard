"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Store,
  Truck,
  Shield,
  CreditCard,
  User,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HelpCategory } from "@/lib/constants/help-content";

// Icon mapping
const ICON_MAP: Record<string, React.ElementType> = {
  ShoppingBag,
  Store,
  Truck,
  Shield,
  CreditCard,
  User,
};

interface HelpCategoryListProps {
  categories: (HelpCategory & { articleCount?: number })[];
  selectedCategory?: string;
  onCategoryClick?: (category: HelpCategory) => void;
  variant?: "list" | "card";
  className?: string;
}

export function HelpCategoryList({
  categories,
  selectedCategory,
  onCategoryClick,
  variant = "list",
  className,
}: HelpCategoryListProps) {
  const router = useRouter();

  const handleClick = (category: HelpCategory) => {
    if (onCategoryClick) {
      onCategoryClick(category);
    } else {
      router.push(`/marketplace/help/category/${category.slug}`);
    }
  };

  if (variant === "card") {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
        {categories.map((category) => {
          const Icon = ICON_MAP[category.icon] || ShoppingBag;
          const isSelected = selectedCategory === category.id;

          return (
            <button
              key={category.id}
              onClick={() => handleClick(category)}
              className={cn(
                "p-5 bg-white rounded-md border text-left transition-all group cursor-pointer",
                isSelected
                  ? "border-gray-900 ring-1 ring-gray-900"
                  : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
              )}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                  <Icon className="h-5 w-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    {category.title}
                  </p>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {category.description}
                  </p>
                  {category.articleCount !== undefined && (
                    <p className="text-xs text-gray-400 mt-2">
                      {category.articleCount} articles
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // List variant (default)
  return (
    <div className={cn("bg-white rounded-md divide-y divide-gray-100", className)}>
      {categories.map((category) => {
        const Icon = ICON_MAP[category.icon] || ShoppingBag;
        const isSelected = selectedCategory === category.id;

        return (
          <button
            key={category.id}
            onClick={() => handleClick(category)}
            className={cn(
              "w-full flex items-center gap-4 p-4 text-left transition-colors cursor-pointer",
              isSelected
                ? "bg-gray-50"
                : "hover:bg-gray-50 active:bg-gray-100"
            )}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Icon className="h-5 w-5 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{category.title}</p>
              <p className="text-xs text-gray-500 truncate">{category.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {category.articleCount !== undefined && (
                <span className="text-xs text-gray-400">{category.articleCount}</span>
              )}
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
