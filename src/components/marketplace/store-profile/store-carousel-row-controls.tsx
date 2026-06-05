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
    <div className="flex items-center gap-2 flex-shrink-0">
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
          "flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm transition-colors",
          canScrollLeft
            ? "hover:bg-gray-50 cursor-pointer"
            : "cursor-default opacity-60"
        )}
      >
        <ChevronLeft
          className={cn(
            "h-4 w-4",
            canScrollLeft ? "text-gray-900" : "text-gray-300"
          )}
        />
      </button>

      <button
        type="button"
        onClick={onScrollRight}
        disabled={!canScrollRight}
        aria-label="Scroll carousel right"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm transition-colors",
          canScrollRight
            ? "hover:bg-gray-50 cursor-pointer"
            : "cursor-default opacity-60"
        )}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4",
            canScrollRight ? "text-gray-900" : "text-gray-300"
          )}
        />
      </button>
    </div>
  );
}
