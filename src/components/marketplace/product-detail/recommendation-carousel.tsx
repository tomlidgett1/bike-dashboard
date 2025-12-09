"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight, Store, User, Sparkles } from "lucide-react";
import { ProductCard, ProductCardSkeleton } from "@/components/marketplace/product-card";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

// ============================================================
// Recommendation Carousel
// Beautiful horizontal scroll carousel for product recommendations
// ============================================================

interface RecommendationCarouselProps {
  title: string;
  subtitle?: string;
  products: MarketplaceProduct[];
  isLoading?: boolean;
  icon?: "sparkles" | "store" | "user";
  seeAllHref?: string;
  seeAllLabel?: string;
  seller?: {
    id: string;
    name: string;
    logo_url: string | null;
    account_type: string | null;
  } | null;
  className?: string;
}

export function RecommendationCarousel({
  title,
  subtitle,
  products,
  isLoading = false,
  icon = "sparkles",
  seeAllHref,
  seeAllLabel = "See All",
  seller,
  className,
}: RecommendationCarouselProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  // Check scroll position
  const checkScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 10);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  }, []);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Initial check
    const timer = setTimeout(checkScroll, 100);
    
    container.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    return () => {
      clearTimeout(timer);
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, products.length]);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Scroll by approximately 3 cards worth
    const cardWidth = 200; // Average card width
    const scrollAmount = cardWidth * 3;
    const targetScroll =
      direction === 'left'
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
  };

  // Don't render if no products and not loading
  if (!isLoading && products.length < 2) {
    return null;
  }

  const IconComponent = icon === "sparkles" ? Sparkles : icon === "store" ? Store : User;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
      className={cn("py-4", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Section Header - Compact on mobile */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Icon - Hidden on mobile */}
          <div className="hidden sm:flex items-center justify-center w-9 h-9 rounded-md bg-gray-100 flex-shrink-0">
            <IconComponent className="h-4.5 w-4.5 text-gray-600" />
          </div>
          
          {/* Title */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{title}</h3>
              {!isLoading && products.length > 0 && (
                <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0">
                  ({products.length})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* See All Link */}
        {seeAllHref && !isLoading && products.length > 4 && (
          <Link
            href={seeAllHref}
            className="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors group flex-shrink-0"
          >
            <span className="hidden sm:inline">{seeAllLabel}</span>
            <span className="sm:hidden">View all</span>
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      {/* Carousel Container */}
      <div className="relative">
        {/* Left Navigation Arrow */}
        <AnimatePresence>
          {canScrollLeft && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: isHovered ? 1 : 0.7, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-5 w-5 text-gray-700" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Right Navigation Arrow */}
        <AnimatePresence>
          {canScrollRight && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: isHovered ? 1 : 0.7, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-5 w-5 text-gray-700" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Gradient Fade Edges */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-50 to-transparent z-10 pointer-events-none" />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-50 to-transparent z-10 pointer-events-none" />
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="flex gap-2.5 sm:gap-4 pb-2" style={{ minWidth: 'min-content' }}>
            {isLoading ? (
              // Loading Skeletons
              Array.from({ length: 6 }).map((_, index) => (
                <motion.div
                  key={`skeleton-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    duration: 0.3, 
                    delay: index * 0.05,
                    ease: [0.04, 0.62, 0.23, 0.98]
                  }}
                  className="flex-shrink-0 w-[160px] sm:w-[180px] md:w-[200px] lg:w-[210px] snap-start"
                >
                  <ProductCardSkeleton />
                </motion.div>
              ))
            ) : (
              // Products with staggered animation
              products.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    duration: 0.3, 
                    delay: index * 0.05,
                    ease: [0.04, 0.62, 0.23, 0.98]
                  }}
                  className="flex-shrink-0 w-[160px] sm:w-[180px] md:w-[200px] lg:w-[210px] snap-start"
                >
                  <ProductCard product={product} priority={index < 4} />
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ============================================================
// Recommendation Carousel Skeleton
// Full section skeleton for loading state
// ============================================================

export function RecommendationCarouselSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("py-6", className)}>
      {/* Header Skeleton */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-md bg-gray-200 animate-pulse" />
        <div className="space-y-2">
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>

      {/* Cards Skeleton */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex-shrink-0 w-[160px] sm:w-[180px] md:w-[200px] lg:w-[210px]"
          >
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

