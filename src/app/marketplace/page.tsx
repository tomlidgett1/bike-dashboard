import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketplacePageContent } from "./marketplace-page-content";
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
    <div className="min-h-screen bg-white sm:bg-gray-50 flex items-center justify-center">
      <div className="animate-pulse text-gray-400">Loading...</div>
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
