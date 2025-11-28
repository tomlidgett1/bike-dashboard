"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Product Card
// Optimized card with Next.js Image and hover effects
// ============================================================

interface ProductCardProps {
  product: MarketplaceProduct;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const [imageError, setImageError] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(priority); // Priority images load immediately
  const imageRef = React.useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading (enterprise-grade)
  React.useEffect(() => {
    if (priority || isVisible) return; // Skip if already loading

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before visible
        threshold: 0.01,
      }
    );

    const target = imageRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [priority, isVisible]);

  // Get best image URL with proper resolution
  const getImageUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    // Use variants for optimal size
    if (product.image_variants && product.image_variants.medium) {
      return `${baseUrl}/storage/v1/object/public/product-images/${product.image_variants.medium}`;
    }
    
    // Fallback to primary_image_url
    if (product.primary_image_url) {
      return product.primary_image_url;
    }
    
    return null;
  };

  const imageUrl = getImageUrl();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Card className="overflow-hidden rounded-md border-gray-200 bg-white hover:shadow-lg transition-shadow duration-200">
        <CardContent className="p-0">
          {/* Image Container */}
          <div 
            ref={imageRef}
            className="relative aspect-square w-full overflow-hidden bg-gray-100"
          >
            {isVisible && imageUrl && !imageError ? (
              <Image
                src={imageUrl}
                alt={product.description}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 20vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                loading={priority ? 'eager' : 'lazy'}
                priority={priority}
                quality={85}
                onError={() => setImageError(true)}
              />
            ) : !isVisible ? (
              // Placeholder before intersection
              <div className="flex h-full w-full items-center justify-center bg-gray-100">
                <div className="animate-pulse h-full w-full bg-gray-200" />
              </div>
            ) : (
              // No image or error
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-16 w-16 text-gray-300" />
              </div>
            )}

            {/* Stock Badge */}
            {product.qoh > 0 && (
              <Badge
                variant="secondary"
                className="absolute top-2 right-2 rounded-md bg-white/90 backdrop-blur-sm text-gray-700 text-xs border-0"
              >
                {product.qoh} in stock
              </Badge>
            )}
          </div>

          {/* Product Info */}
          <div className="p-4 space-y-2">
            {/* Category Badge */}
            {product.marketplace_subcategory && (
              <Badge
                variant="secondary"
                className="rounded-md bg-gray-100 text-gray-600 text-xs font-medium border-0"
              >
                {product.marketplace_subcategory}
              </Badge>
            )}

            {/* Product Title */}
            <h3 className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">
              {product.description}
            </h3>

            {/* Price and Year */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-lg font-semibold text-gray-900">
                ${product.price.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {product.model_year && (
                <span className="text-xs text-gray-500">{product.model_year}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Product Card Skeleton
// Loading state with shimmer effect
// ============================================================

export function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-md border-gray-200 bg-white">
      <CardContent className="p-0">
        {/* Image Skeleton */}
        <div className="relative aspect-square w-full bg-gray-200 animate-pulse" />

        {/* Content Skeleton */}
        <div className="p-4 space-y-2">
          <div className="h-5 w-16 bg-gray-200 rounded-md animate-pulse" />
          <div className="space-y-1">
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

