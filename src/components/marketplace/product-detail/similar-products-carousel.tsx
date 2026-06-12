"use client";

import * as React from "react";
import { RecommendationCarousel } from "@/components/marketplace/product-detail/recommendation-carousel";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

interface SimilarProductsCarouselProps {
  productId: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  className?: string;
}

export function SimilarProductsCarousel({
  productId,
  seeAllHref,
  seeAllLabel = "Browse Category",
  className,
}: SimilarProductsCarouselProps) {
  const [products, setProducts] = React.useState<MarketplaceProduct[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSimilarProducts() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/marketplace/products/${encodeURIComponent(productId)}/similar?limit=12&mode=llm&v=3`,
          { signal: controller.signal, cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(`Similar products request failed (${response.status})`);
        }

        const data = (await response.json()) as { products?: MarketplaceProduct[] };
        let nextProducts = Array.isArray(data.products) ? data.products : [];

        // Fallback if LLM path returned nothing — same-category rules ranking.
        if (nextProducts.length === 0) {
          const rulesResponse = await fetch(
            `/api/marketplace/products/${encodeURIComponent(productId)}/similar?limit=12&mode=rules&v=3`,
            { signal: controller.signal, cache: "no-store" },
          );
          if (rulesResponse.ok) {
            const rulesData = (await rulesResponse.json()) as { products?: MarketplaceProduct[] };
            nextProducts = Array.isArray(rulesData.products) ? rulesData.products : [];
          }
        }

        if (!cancelled) {
          setProducts(nextProducts);
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[SimilarProductsCarousel] fetch failed:", error);
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSimilarProducts();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [productId]);

  return (
    <RecommendationCarousel
      title="Similar Items"
      products={products}
      isLoading={isLoading}
      icon="sparkles"
      seeAllHref={seeAllHref}
      seeAllLabel={seeAllLabel}
      className={className}
    />
  );
}
