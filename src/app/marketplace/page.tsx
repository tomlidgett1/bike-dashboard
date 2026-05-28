import { Suspense } from "react";
import { MarketplacePageContent } from "./marketplace-page-content";
import { fetchInitialMarketplaceProducts } from "@/lib/server/fetch-initial-marketplace-products";

// Cache the rendered output for 60 s, then revalidate in the background (ISR).
// The layout is dynamic (reads auth cookies) but the page data itself — the
// initial product grid — is public and safe to cache at this level.
export const revalidate = 60;

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
  const initialData = await fetchInitialMarketplaceProducts();

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
    <Suspense fallback={<LoadingFallback />}>
      <MarketplaceDataFetcher />
    </Suspense>
  );
}
