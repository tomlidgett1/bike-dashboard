"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreCarouselRowControlsProps = {
  onSeeAll?: () => void;
  seeAllLabel?: string;
  showSeeAll?: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
};

/**
 * Header controls for store product carousels — "See All" + prev/next pills.
 */
export function StoreCarouselRowControls({
  onSeeAll,
  seeAllLabel = "See All",
  showSeeAll = true,
  canScrollLeft,
  canScrollRight,
  onScrollLeft,
  onScrollRight,
}: StoreCarouselRowControlsProps) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {showSeeAll && onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm font-semibold text-gray-900 hover:text-gray-700 transition-colors cursor-pointer"
        >
          {seeAllLabel}
        </button>
      )}

      <button
        type="button"
        onClick={onScrollLeft}
        disabled={!canScrollLeft}
        aria-label="Scroll carousel left"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 bg-white/70 transition-colors",
          canScrollLeft
            ? "text-gray-400 hover:bg-gray-50 hover:text-gray-600 cursor-pointer"
            : "cursor-default opacity-40"
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onScrollRight}
        disabled={!canScrollRight}
        aria-label="Scroll carousel right"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 bg-white/70 transition-colors",
          canScrollRight
            ? "text-gray-400 hover:bg-gray-50 hover:text-gray-600 cursor-pointer"
            : "cursor-default opacity-40"
        )}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
