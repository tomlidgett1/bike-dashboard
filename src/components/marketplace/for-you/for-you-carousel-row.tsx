"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, EyeOff, X } from "lucide-react";
import { ProductCard } from "@/components/marketplace/product-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  trackCarouselImpression,
  trackCarouselClick,
  trackProductImpression,
  trackInteraction,
} from "@/lib/tracking/interaction-tracker";
import type { ForYouCarousel } from "@/lib/for-you/types";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// For You carousel row
// ============================================================
// Horizontal product carousel with full behavioural instrumentation:
// carousel impressions, per-product impressions, clicks with position,
// per-product "not interested", and whole-carousel hide.

interface ForYouCarouselRowProps {
  carousel: ForYouCarousel;
  userId?: string;
  onDismissProduct: (carouselKey: string, productId: string) => void;
  onHideCarousel: (carouselKey: string) => void;
}

export function ForYouCarouselRow({
  carousel,
  userId,
  onDismissProduct,
  onHideCarousel,
}: ForYouCarouselRowProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const sectionRef = React.useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  // Carousel impression — once, when half the row is on screen.
  React.useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            trackCarouselImpression(
              carousel.key,
              { source: carousel.source, size: carousel.products.length },
              userId,
            );
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [carousel.key, carousel.source, carousel.products.length, userId]);

  const checkScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 10);
  }, []);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    checkScroll();
    container.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      container.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, carousel.products.length]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const amount = container.clientWidth * 0.8;
    container.scrollTo({
      left: direction === "left" ? container.scrollLeft - amount : container.scrollLeft + amount,
      behavior: "smooth",
    });
  };

  if (carousel.products.length === 0) return null;

  return (
    <section ref={sectionRef} className="py-2.5 sm:py-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2.5 sm:mb-3">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
            {carousel.title}
          </h3>
          {carousel.explanation && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{carousel.explanation}</p>
          )}
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Carousel options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-white rounded-md">
            <DropdownMenuItem
              onClick={() => onHideCarousel(carousel.key)}
              className="cursor-pointer rounded-md text-sm"
            >
              <EyeOff className="mr-2 h-4 w-4" />
              Show less like this
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Products */}
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-5 w-5 text-gray-700" />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-hide snap-x snap-mandatory sm:snap-none"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            overflowY: "hidden",
          }}
        >
          <div className="flex gap-2.5 sm:gap-3 md:gap-4" style={{ minWidth: "min-content" }}>
            {carousel.products.map((product, index) => (
              <ForYouCard
                key={product.id}
                product={product}
                index={index}
                carouselKey={carousel.key}
                carouselSource={carousel.source}
                userId={userId}
                onDismiss={onDismissProduct}
              />
            ))}
            <div className="w-3 flex-shrink-0 sm:hidden" />
          </div>
        </div>
      </div>
    </section>
  );
}

interface ForYouCardProps {
  product: MarketplaceProduct;
  index: number;
  carouselKey: string;
  carouselSource: "deterministic" | "llm";
  userId?: string;
  onDismiss: (carouselKey: string, productId: string) => void;
}

function ForYouCard({
  product,
  index,
  carouselKey,
  carouselSource,
  userId,
  onDismiss,
}: ForYouCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Per-product impression — once, when 50% visible.
  React.useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            trackProductImpression(
              product.id,
              { carousel_key: carouselKey, position: index, source: "for_you" },
              userId,
            );
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [product.id, carouselKey, index, userId]);

  return (
    <div
      ref={cardRef}
      className="group/foryou relative flex-shrink-0 min-h-0 overflow-hidden w-[145px] xs:w-[160px] sm:w-[180px] md:w-[200px] lg:w-[220px] xl:w-[240px] snap-start"
      onClickCapture={() => {
        trackCarouselClick(carouselKey, product.id, index, { source: carouselSource }, userId);
      }}
    >
      {/* Not interested — subtle, hover-revealed on desktop */}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          trackInteraction("dismiss", {
            productId: product.id,
            metadata: { carousel_key: carouselKey },
            userId,
          });
          onDismiss(carouselKey, product.id);
        }}
        className="absolute top-1.5 left-1.5 z-20 hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-white/90 shadow-sm text-gray-400 opacity-0 group-hover/foryou:opacity-100 hover:text-gray-800 hover:bg-white transition-all"
        aria-label="Not interested"
        title="Not interested"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <ProductCard product={product} priority={index < 4} inCarousel />
    </div>
  );
}
