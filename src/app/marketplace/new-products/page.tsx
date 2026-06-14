import { Suspense } from "react";
import { fetchInitialNewProducts } from "@/lib/server/fetch-initial-new-products";
import { NewProductsClient } from "./new-products-client";

// Server-render the initial grid (seeds the client) so crawlers see real
// products. Mirrors the marketplace homepage's Suspense + async-fetcher pattern,
// which SSRs the same useUpload-dependent header without issue. (metadata lives
// in ./layout.tsx)
export const revalidate = 60;

async function NewProductsFetcher() {
  const initialData = await fetchInitialNewProducts();
  return <NewProductsClient initialData={initialData} />;
}

export default function NewProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white sm:bg-gray-50 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      }
    >
      <NewProductsFetcher />
    </Suspense>
  );
}
