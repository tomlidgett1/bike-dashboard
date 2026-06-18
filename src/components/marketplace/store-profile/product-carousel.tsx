"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight } from '@/components/layout/app-sidebar/dashboard-icons';
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/marketplace/product-card";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Product Carousel
// Horizontal scrollable carousel with "See All" expand
// ============================================================

interface ProductCarouselProps {
  categoryName: string;
  products: MarketplaceProduct[];
  initialVisibleCount?: number;
  isFeatured?: boolean;
  /** When provided: replaces the inline "See All" expand with a navigation button below the carousel */
  onViewAll?: () => void;
}

export function ProductCarousel({
  categoryName,
  products,
  initialVisibleCount = 10,
  isFeatured = false,
  onViewAll,
}: ProductCarouselProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  // Check scroll position
  const checkScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  }, []);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    checkScroll();
    container.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);

    return () => {
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, isExpanded]);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const targetScroll =
      direction === 'left'
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
  };

  const displayedProducts = isExpanded ? products : products.slice(0, initialVisibleCount);
  const hasMore = products.length > initialVisibleCount;

  return (
    <section className="py-2.5 sm:py-3">
      {/* Category Header */}
      <div className="flex items-center justify-between mb-2.5 sm:mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900">{categoryName}</h3>
          {isFeatured && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-800" style={{ backgroundColor: '#ffde59' }}>
              Featured
            </span>
          )}
        </div>
        {/* Only show inline See All when not using external navigation */}
        {hasMore && !onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 h-auto py-1 px-2 sm:px-3"
          >
            {isExpanded ? 'Show Less' : `See All (${products.length})`}
          </Button>
        )}
      </div>

      {/* Products */}
      <AnimatePresence mode="wait">
        {isExpanded ? (
          // Expanded Grid View - Mobile Optimised
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4"
          >
            {displayedProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 6} />
            ))}
          </motion.div>
        ) : (
          // Carousel View - Mobile Optimised
          <motion.div
            key="carousel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            {/* Left Arrow - Hidden on Mobile */}
            {canScrollLeft && !isExpanded && (
              <button
                onClick={() => scroll('left')}
                className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg items-center justify-center hover:bg-gray-50 transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700" />
              </button>
            )}

            {/* Right Arrow - Hidden on Mobile */}
            {canScrollRight && !isExpanded && (
              <button
                onClick={() => scroll('right')}
                className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg items-center justify-center hover:bg-gray-50 transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-5 w-5 text-gray-700" />
              </button>
            )}

            {/* Scrollable Container - Mobile Optimised */}
            <div
              ref={scrollContainerRef}
              className="overflow-x-auto scrollbar-hide snap-x snap-mandatory sm:snap-none"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
                overflowY: 'hidden',
              }}
            >
              <div className="flex gap-2.5 sm:gap-3 md:gap-4" style={{ minWidth: 'min-content' }}>
                {displayedProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="flex-shrink-0 min-h-0 overflow-hidden w-[145px] xs:w-[160px] sm:w-[180px] md:w-[200px] lg:w-[220px] xl:w-[240px] snap-start"
                  >
                    <ProductCard product={product} priority={index < 6} inCarousel />
                  </div>
                ))}
                {/* Spacer for mobile scroll end */}
                <div className="w-3 flex-shrink-0 sm:hidden" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View all — shown when external navigation is wired up */}
      {onViewAll && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            View all {categoryName} products
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}

