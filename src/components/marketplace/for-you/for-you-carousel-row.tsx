"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, MoreHorizontal, EyeOff, X } from '@/components/layout/app-sidebar/dashboard-icons';
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
import { FOR_YOU_CAROUSEL_CARD_WIDTH, FOR_YOU_CAROUSEL_COLLAPSED_COUNT, forYouExpandedGridClass } from "@/components/marketplace/for-you/carousel-card-width";
import { cn } from "@/lib/utils";

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
  /** Matches marketplace product grid spacing when rendered as a homepage tab. */
  embedded?: boolean;
}

export function ForYouCarouselRow({
  carousel,
  userId,
  onDismissProduct,
  onHideCarousel,
  embedded = false,
}: ForYouCarouselRowProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const sectionRef = React.useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const hasMore = carousel.products.length > FOR_YOU_CAROUSEL_COLLAPSED_COUNT;
  const collapsedProducts = hasMore
    ? carousel.products.slice(0, FOR_YOU_CAROUSEL_COLLAPSED_COUNT)
    : carousel.products;
  const hiddenCount = carousel.products.length - FOR_YOU_CAROUSEL_COLLAPSED_COUNT;
  const displayedProducts = isExpanded ? carousel.products : collapsedProducts;

  const handleToggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (prev && scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
      return next;
    });
  };

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
  }, [checkScroll, carousel.products.length, isExpanded]);

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
    <section ref={sectionRef}>
      {/* Header — matches store Products tab CarouselRow */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
            {carousel.title}
          </h3>
          {carousel.explanation && (
            <p className="text-xs text-gray-500 mt-0 truncate leading-tight">{carousel.explanation}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {(isExpanded || hasMore) && (
            <button
              type="button"
              onClick={handleToggleExpanded}
              className="text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap"
              aria-expanded={isExpanded}
            >
              {isExpanded ? "Show less" : `See more (${hiddenCount})`}
            </button>
          )}
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
      </div>

      {/* Products */}
      <AnimatePresence mode="wait" initial={false}>
        {isExpanded ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            <div className={forYouExpandedGridClass(embedded)}>
              {displayedProducts.map((product, index) => (
                <ForYouCard
                  key={product.id}
                  product={product}
                  index={index}
                  carouselKey={carousel.key}
                  carouselSource={carousel.source}
                  userId={userId}
                  onDismiss={onDismissProduct}
                  variant="grid"
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="carousel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative"
          >
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
          <div
            className="flex items-start gap-1.5 sm:gap-2"
            style={{ minWidth: "min-content" }}
          >
            {displayedProducts.map((product, index) => (
              <ForYouCard
                key={product.id}
                product={product}
                index={index}
                carouselKey={carousel.key}
                carouselSource={carousel.source}
                userId={userId}
                onDismiss={onDismissProduct}
                variant="carousel"
              />
            ))}
          </div>
        </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  variant?: "carousel" | "grid";
}

function ForYouCard({
  product,
  index,
  carouselKey,
  carouselSource,
  userId,
  onDismiss,
  variant = "carousel",
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
      className={cn(
        "group/foryou relative min-h-0 overflow-hidden",
        variant === "carousel"
          ? cn("flex flex-col flex-shrink-0 snap-start", FOR_YOU_CAROUSEL_CARD_WIDTH)
          : "w-full",
      )}
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
      <ProductCard
        product={product}
        priority={index < 4}
        inCarousel={variant === "carousel"}
        hideStoreMeta={variant === "carousel"}
      />
    </div>
  );
}
