"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
}

export function ProductCarousel({
  categoryName,
  products,
  initialVisibleCount = 6,
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
    <section className="py-3">
      {/* Category Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">{categoryName}</h3>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {isExpanded ? 'Show Less' : `See All (${products.length})`}
          </Button>
        )}
      </div>

      {/* Products */}
      <AnimatePresence mode="wait">
        {isExpanded ? (
          // Expanded Grid View
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          >
            {displayedProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 6} />
            ))}
          </motion.div>
        ) : (
          // Carousel View
          <motion.div
            key="carousel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            {/* Left Arrow */}
            {canScrollLeft && !isExpanded && (
              <button
                onClick={() => scroll('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700" />
              </button>
            )}

            {/* Right Arrow */}
            {canScrollRight && !isExpanded && (
              <button
                onClick={() => scroll('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-5 w-5 text-gray-700" />
              </button>
            )}

            {/* Scrollable Container */}
            <div
              ref={scrollContainerRef}
              className="overflow-x-auto scrollbar-hide -mx-2 px-2"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
                {displayedProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="flex-shrink-0"
                    style={{
                      width: 'calc((100vw - 3rem) / 2)',
                      maxWidth: '240px',
                    }}
                  >
                    <ProductCard product={product} priority={index < 6} />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

