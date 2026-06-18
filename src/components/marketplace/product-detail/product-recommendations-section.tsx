"use client";

import * as React from "react";
import { Suspense, use } from "react";
import { RecommendationCarousel } from "@/components/marketplace/product-detail/recommendation-carousel";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Product Recommendations Section
// "More from this Seller" + "More from {Brand}" carousels.
//
// The data is fetched on the server but streamed (passed as a Promise and
// resolved with React 19's `use()` inside a Suspense boundary), so it no longer
// blocks the product page's first paint. The hero, gallery, price and details
// render immediately; these below-the-fold carousels fill in a beat later.
// ============================================================

export interface ProductRecommendations {
  sellerProducts: MarketplaceProduct[];
  brandProducts: MarketplaceProduct[];
}

interface ProductRecommendationsSectionProps {
  /** Resolves to the seller/brand product lists. Created on the server, not awaited. */
  promise: Promise<ProductRecommendations>;
  sellerName: string | null;
  sellerSeeAllHref?: string;
  sellerSeeAllLabel?: string;
  brandName: string | null;
}

function sellerTitle(sellerName: string | null) {
  return sellerName ? `More from ${sellerName}` : "More from this Seller";
}

function RecommendationsContent({
  promise,
  sellerName,
  sellerSeeAllHref,
  sellerSeeAllLabel = "View All Listings",
  brandName,
}: ProductRecommendationsSectionProps) {
  const { sellerProducts, brandProducts } = use(promise);

  return (
    <>
      <RecommendationCarousel
        title={sellerTitle(sellerName)}
        products={sellerProducts}
        isLoading={false}
        icon="store"
        seeAllHref={sellerSeeAllHref}
        seeAllLabel={sellerSeeAllLabel}
      />
      {brandName && (
        <RecommendationCarousel
          title={`More from ${brandName}`}
          products={brandProducts}
          isLoading={false}
          icon="sparkles"
          seeAllHref={`/marketplace?brand=${encodeURIComponent(brandName)}`}
          seeAllLabel={`All ${brandName}`}
        />
      )}
    </>
  );
}

function RecommendationsFallback({
  sellerName,
  brandName,
}: {
  sellerName: string | null;
  brandName: string | null;
}) {
  // Same carousels in their built-in skeleton state, so the section keeps its
  // height and there is no layout shift when the real data streams in.
  return (
    <>
      <RecommendationCarousel title={sellerTitle(sellerName)} products={[]} isLoading icon="store" />
      {brandName && (
        <RecommendationCarousel title={`More from ${brandName}`} products={[]} isLoading icon="sparkles" />
      )}
    </>
  );
}

export function ProductRecommendationsSection(props: ProductRecommendationsSectionProps) {
  return (
    <Suspense
      fallback={<RecommendationsFallback sellerName={props.sellerName} brandName={props.brandName} />}
    >
      <RecommendationsContent {...props} />
    </Suspense>
  );
}
