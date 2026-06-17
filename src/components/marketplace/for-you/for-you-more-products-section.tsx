"use client";

import * as React from "react";
import { X } from "lucide-react";
import { ProductCard } from "@/components/marketplace/product-card";
import {
  trackCarouselClick,
  trackProductImpression,
  trackInteraction,
} from "@/lib/tracking/interaction-tracker";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { forYouExpandedGridClass } from "@/components/marketplace/for-you/carousel-card-width";
import { MIN_MORE_PRODUCTS } from "@/lib/for-you/constants";
import { cn } from "@/lib/utils";

export const FOR_YOU_MORE_SECTION_KEY = "more-products";

interface ForYouMoreProductsSectionProps {
  products: MarketplaceProduct[];
  userId?: string;
  embedded?: boolean;
  onDismissProduct: (productId: string) => void;
}

export function ForYouMoreProductsSection({
  products,
  userId,
  embedded = false,
  onDismissProduct,
}: ForYouMoreProductsSectionProps) {
  if (products.length < MIN_MORE_PRODUCTS) return null;

  return (
    <section className="pt-2">
      <div className="mb-1">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 leading-tight">
          More you might like
        </h3>
        <p className="text-xs text-gray-500 mt-0 truncate leading-tight">
          More picks from the same kinds of gear above
        </p>
      </div>
      <div className={forYouExpandedGridClass(embedded)}>
        {products.map((product, index) => (
          <ForYouMoreProductCard
            key={product.id}
            product={product}
            index={index}
            userId={userId}
            onDismiss={onDismissProduct}
          />
        ))}
      </div>
    </section>
  );
}

interface ForYouMoreProductCardProps {
  product: MarketplaceProduct;
  index: number;
  userId?: string;
  onDismiss: (productId: string) => void;
}

function ForYouMoreProductCard({
  product,
  index,
  userId,
  onDismiss,
}: ForYouMoreProductCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            trackProductImpression(
              product.id,
              { carousel_key: FOR_YOU_MORE_SECTION_KEY, position: index, source: "for_you" },
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
  }, [product.id, index, userId]);

  return (
    <div
      ref={cardRef}
      className={cn("group/foryou relative min-h-0 overflow-hidden w-full")}
      onClickCapture={() => {
        trackCarouselClick(
          FOR_YOU_MORE_SECTION_KEY,
          product.id,
          index,
          { source: "deterministic" },
          userId,
        );
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          trackInteraction("dismiss", {
            productId: product.id,
            metadata: { carousel_key: FOR_YOU_MORE_SECTION_KEY },
            userId,
          });
          onDismiss(product.id);
        }}
        className="absolute top-1.5 left-1.5 z-20 hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-white/90 shadow-sm text-gray-400 opacity-0 group-hover/foryou:opacity-100 hover:text-gray-800 hover:bg-white transition-all"
        aria-label="Not interested"
        title="Not interested"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <ProductCard product={product} priority={index < 6} />
    </div>
  );
}
