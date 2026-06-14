"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const BENTO_SLOT_WIDTH = 340;

export function OverivewoBentoCarouselRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const childCount = React.Children.count(children);

  const updateScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  React.useEffect(() => {
    updateScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);
    return () => {
      el.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
    };
  }, [updateScroll, childCount]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "left" ? -(BENTO_SLOT_WIDTH + 24) : BENTO_SLOT_WIDTH + 24,
      behavior: "smooth",
    });
  }

  return (
    <div className={cn("relative w-full", className)}>
      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => scroll("left")}
          aria-label="Scroll bentos left"
          className="absolute left-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200/80 bg-white shadow-md transition-colors hover:bg-gray-50 sm:flex"
        >
          <ChevronLeft className="h-4 w-4 text-gray-700" />
        </button>
      ) : null}
      {canScrollRight ? (
        <button
          type="button"
          onClick={() => scroll("right")}
          aria-label="Scroll bentos right"
          className="absolute right-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200/80 bg-white shadow-md transition-colors hover:bg-gray-50 sm:flex"
        >
          <ChevronRight className="h-4 w-4 text-gray-700" />
        </button>
      ) : null}

      <div
        ref={scrollRef}
        className="w-full overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="flex min-w-min items-start gap-5 sm:gap-6 lg:gap-8">
          {React.Children.map(children, (child, index) => (
            <div
              key={React.isValidElement(child) && child.key != null ? String(child.key) : index}
              className="w-[min(340px,calc(100vw-2rem))] shrink-0 snap-start"
            >
              {child}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
