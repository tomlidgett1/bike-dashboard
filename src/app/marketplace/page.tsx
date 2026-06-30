import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketplacePageContent } from "./marketplace-page-content";
import { ProductCardSkeleton } from "@/components/marketplace/product-card";
import { fetchInitialStoresProducts } from "@/lib/server/fetch-initial-marketplace-products";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/layout/site-footer";
import { organizationSchema, websiteSchema } from "@/lib/seo/structured-data";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/site";

// Cache the rendered output briefly, then revalidate in the background (ISR).
// The layout is dynamic (reads auth cookies) but the page data itself — the
// initial product grid — is public and safe to cache at this level.
export const revalidate = 15;

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/marketplace" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/marketplace",
  },
};

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-white sm:bg-gray-50">
      <div className="mx-auto max-w-[1920px] px-2 py-4 sm:px-4 sm:py-6">
        <div className="mb-4 h-10 w-48 animate-pulse rounded-md bg-gray-100" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-0.5 sm:gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <ProductCardSkeleton key={i} layout="grid" />
          ))}
        </div>
      </div>
    </div>
  );
}

// Async inner component — suspends while fetching products, enabling streaming:
// the browser receives the LoadingFallback shell immediately while the DB query
// runs on the server, then the product HTML streams in once it's ready.
async function MarketplaceDataFetcher() {
  const initialData = await fetchInitialStoresProducts();

  // MarketplacePageContent uses useSearchParams, which requires a Suspense
  // boundary. The outer boundary (in MarketplacePage) covers both this fetch
  // and the useSearchParams requirement, so no second boundary is needed here.
  return (
    <MarketplacePageContent
      initialProducts={initialData.products}
      initialPagination={initialData.pagination}
    />
  );
}

export default function MarketplacePage() {
  return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema()]} />
      <Suspense fallback={<LoadingFallback />}>
        <MarketplaceDataFetcher />
      </Suspense>
      {/* Crawlable internal links from the highest-authority page → the agent's
          SEO hubs/leaves, so Google discovers + weights them fast (not just via
          the sitemap). Streams in separately; never blocks the product grid. */}
      <SiteFooter showSeoSections />
    </>
  );
}
