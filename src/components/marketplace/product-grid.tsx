"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Loader2, Package } from "lucide-react";
import { ProductCard } from "./product-card";
import { Button } from "@/components/ui/button";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Product Grid
// Responsive grid with infinite scroll
// ============================================================

interface ProductGridProps {
  products: MarketplaceProduct[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export function ProductGrid({
  products,
  loading = false,
  hasMore = false,
  onLoadMore,
}: ProductGridProps) {
  const observerTarget = React.useRef<HTMLDivElement>(null);

  // Intersection Observer for infinite scroll
  React.useEffect(() => {
    if (!hasMore || loading || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [hasMore, loading, onLoadMore]);

  // Empty state
  if (!loading && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4">
        <div className="rounded-full bg-gray-100 p-6 mb-4">
          <Package className="h-12 w-12 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          No products found
        </h3>
        <p className="text-sm text-gray-600 text-center max-w-md">
          Try adjusting your filters or search query to find what you're looking for.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Products Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
      >
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            priority={index < 8} // Prioritize first 8 images
          />
        ))}
      </motion.div>

      {/* Infinite Scroll Trigger */}
      {hasMore && (
        <div ref={observerTarget} className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* Load More Button (fallback for when intersection observer doesn't work) */}
      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button
            onClick={onLoadMore}
            variant="outline"
            className="rounded-md border-gray-300 hover:bg-gray-50"
          >
            Load More Products
          </Button>
        </div>
      )}
    </div>
  );
}

