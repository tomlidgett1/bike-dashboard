"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal product carousel track for mobile store pages.
 * Keeps the scrollable area inside the viewport to avoid page-level sideways drag.
 */
export function StoreProductCarouselScroll({
  children,
  scrollRef,
  bleed: _bleed = false,
  className,
}: {
  children: React.ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  bleed?: boolean;
  className?: string;
}) {
  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div
        ref={scrollRef}
        className={cn(
          "overflow-x-auto overflow-y-hidden scrollbar-hide snap-x snap-mandatory",
          "overscroll-x-contain carousel-scroll-track",
          "max-sm:scroll-pl-4 sm:snap-none",
          className,
        )}
        style={
          {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            overflowY: "hidden",
          } as React.CSSProperties
        }
      >
        <div className="inline-flex items-start gap-2 pr-4 sm:gap-2 sm:pr-0">{children}</div>
      </div>
    </div>
  );
}
