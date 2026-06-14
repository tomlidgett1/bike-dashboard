import { Suspense } from "react";
import { fetchInitialMarketplaceProducts } from "@/lib/server/fetch-initial-marketplace-products";
import { UsedProductsClient } from "./used-products-client";

// Server-renders the initial grid for crawlers. Reads filters from the URL on
// the server (so the grid SSRs without a useSearchParams CSR-bailout) and seeds
// only the canonical, unfiltered view. (metadata lives in ./layout.tsx)
export const revalidate = 60;

async function UsedProductsFetcher({
  searchParams,
}: {
  searchParams: { level1?: string; level2?: string; level3?: string; sortBy?: string };
}) {
  const isDefaultView =
    !searchParams.level1 &&
    !searchParams.level2 &&
    !searchParams.level3 &&
    (!searchParams.sortBy || searchParams.sortBy === "newest");
  // Seed only the canonical default view; filtered views fetch client-side so
  // the seed never mismatches the active filters.
  const initialData = isDefaultView ? await fetchInitialMarketplaceProducts() : undefined;

  return (
    <UsedProductsClient
      initialData={initialData}
      initialLevel1={searchParams.level1 ?? null}
      initialLevel2={searchParams.level2 ?? null}
      initialLevel3={searchParams.level3 ?? null}
      initialSortBy={searchParams.sortBy ?? "newest"}
    />
  );
}

export default async function UsedProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ level1?: string; level2?: string; level3?: string; sortBy?: string }>;
}) {
  const sp = await searchParams;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      }
    >
      <UsedProductsFetcher searchParams={sp} />
    </Suspense>
  );
}
