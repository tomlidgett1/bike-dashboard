export interface SpeedSearchCandidate {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  source?: string;
  domain?: string;
  width?: number;
  height?: number;
}

export interface SpeedWorkbenchProduct {
  id: string;
  normalized_name: string;
  display_name: string | null;
  upc: string | null;
  category: string | null;
  manufacturer: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  image_review_search_query: string | null;
  primary_image_url?: string | null;
  // Aggregates from linked store products (added by 20260528120000 migration)
  total_qoh?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  avg_price?: number | null;
  linked_products?: number | null;
  // Representative store product name (actual product name, not canonical normalized_name)
  store_product_name?: string | null;
}

export type SpeedQueueStatus =
  | "queued"
  | "loading"
  | "ready"
  | "error"
  | "saving"
  | "approved"
  | "skipped"
  | "no_results";

export interface SpeedQueueItem {
  product: SpeedWorkbenchProduct;
  searchQuery: string;
  status: SpeedQueueStatus;
  candidates: SpeedSearchCandidate[];
  error?: string;
  dismissedUrls: string[];
}

export function buildSpeedSearchQuery(product: SpeedWorkbenchProduct) {
  return (
    product.image_review_search_query ||
    [product.upc, product.manufacturer, product.display_name || product.normalized_name, product.marketplace_subcategory || product.category, "cycling product image"]
      .filter(Boolean)
      .join(" ")
  );
}

export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function fetchSerperCandidates(
  product: SpeedWorkbenchProduct,
  searchQuery: string,
): Promise<SpeedSearchCandidate[]> {
  const response = await fetch("/api/admin/ecommerce-hero/search-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchQuery: searchQuery.trim(),
      productName: product.normalized_name,
      brand: product.manufacturer,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Serper search failed");
  }
  return (result.results || []) as SpeedSearchCandidate[];
}
