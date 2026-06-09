import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SpeedSearchCandidate } from "@/lib/admin/image-qa-speed";
import type { SerperAiSelectionCache } from "@/lib/optimize/serper-image-cache";

const PAGE_SIZE = 200;
const CONCURRENCY = 3;

type ProductRow = {
  id: string;
  canonical_product_id: string | null;
  display_name: string | null;
  description: string;
  brand: string | null;
  manufacturer_name: string | null;
  upc: string | null;
  category_name: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  listing_source: string | null;
  canonical_products: {
    id: string;
    normalized_name: string | null;
    upc: string | null;
    image_review_search_query: string | null;
    serper_candidates_fetched_at: string | null;
    product_images: Array<{
      source?: string | null;
      approval_status?: string | null;
      cloudinary_public_id?: string | null;
      cloudinary_url?: string | null;
      external_url?: string | null;
    }> | null;
  } | null;
};

export type CategoryPreloadJobParams = {
  jobId: string;
  userId: string;
  categoryId: string;
  categoryName: string;
  force: boolean;
  origin: string;
  cookieHeader: string;
};

function buildSearchQuery(product: ProductRow): string {
  const canonical = product.canonical_products;
  return (
    canonical?.image_review_search_query ||
    [
      product.upc || canonical?.upc,
      product.brand || product.manufacturer_name,
      product.display_name || product.description,
      product.marketplace_subcategory || product.category_name,
      "cycling product image",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function hasSerperApprovedImage(product: ProductRow): boolean {
  const images = product.canonical_products?.product_images ?? [];
  const isLightspeed =
    product.listing_source !== "manual" && product.listing_source !== "online_catalog";

  if (!isLightspeed) {
    return images.some(
      (img) =>
        (img.approval_status === "approved" || img.approval_status === null) &&
        (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
    );
  }

  return images.some(
    (img) =>
      img.source === "serper_workbench" &&
      (img.approval_status === "approved" || img.approval_status === null) &&
      (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
  );
}

async function searchSerper(
  origin: string,
  cookieHeader: string,
  searchQuery: string,
  productName: string,
  brand?: string | null,
): Promise<SpeedSearchCandidate[]> {
  const response = await fetch(`${origin}/api/admin/ecommerce-hero/search-images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({
      searchQuery: searchQuery.trim(),
      productName,
      brand: brand || undefined,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Serper search failed");
  }

  return (data.results || []) as SpeedSearchCandidate[];
}

async function selectAiCandidates(
  origin: string,
  cookieHeader: string,
  product: ProductRow,
  candidates: SpeedSearchCandidate[],
): Promise<SerperAiSelectionCache | null> {
  const productName =
    product.display_name ||
    product.canonical_products?.normalized_name ||
    product.description;

  const response = await fetch(`${origin}/api/admin/images/ai-select-candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({
      productName,
      brand: product.brand || product.manufacturer_name || undefined,
      upc: product.upc || product.canonical_products?.upc || undefined,
      candidates,
      maxImages: 6,
    }),
  });

  const json = await response.json();
  if (!response.ok || !json.success || !json.primaryUrl) {
    return null;
  }

  return {
    selectedCandidates: json.selectedCandidates || [],
    selectedUrls: json.selectedUrls || [],
    primaryUrl: json.primaryUrl,
    reasoning: json.reasoning,
  };
}

async function fetchCategoryProducts(userId: string, categoryId: string): Promise<ProductRow[]> {
  const supabase = createServiceRoleClient();
  const rows: ProductRow[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        canonical_product_id,
        display_name,
        description,
        brand,
        manufacturer_name,
        upc,
        category_name,
        marketplace_category,
        marketplace_subcategory,
        listing_source,
        canonical_products!canonical_product_id (
          id,
          normalized_name,
          upc,
          image_review_search_query,
          serper_candidates_fetched_at,
          product_images!canonical_product_id (
            source,
            approval_status,
            cloudinary_public_id,
            cloudinary_url,
            external_url
          )
        )
      `,
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("qoh", 0)
      .eq("lightspeed_category_id", categoryId)
      .not("canonical_product_id", "is", null)
      .range(from, to);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...(data as unknown as ProductRow[]));
    if (data.length < PAGE_SIZE) break;
    page += 1;
  }

  const byCanonical = new Map<string, ProductRow>();
  for (const row of rows) {
    const cid = row.canonical_product_id;
    if (!cid || byCanonical.has(cid)) continue;
    byCanonical.set(cid, row);
  }

  return [...byCanonical.values()];
}

async function updateJob(
  jobId: string,
  patch: Record<string, unknown>,
) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("optimize_background_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    console.error("[category-preload-job] update failed", jobId, error.message);
  }
}

async function isJobCancelled(jobId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("optimize_background_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  return data?.status === "cancelled";
}

export async function runCategoryPreloadJob(params: CategoryPreloadJobParams): Promise<void> {
  const { jobId, userId, categoryId, force, origin, cookieHeader } = params;
  const supabase = createServiceRoleClient();

  try {
    await updateJob(jobId, {
      status: "running",
      started_at: new Date().toISOString(),
      message: "Loading products in category…",
    });

    const products = await fetchCategoryProducts(userId, categoryId);
    const targets = products.filter((product) => {
      if (!product.canonical_product_id) return false;
      if (hasSerperApprovedImage(product)) return false;
      if (!force && product.canonical_products?.serper_candidates_fetched_at) return false;
      return true;
    });

    const skipped = products.length - targets.length;

    await updateJob(jobId, {
      total: targets.length,
      skipped,
      message:
        targets.length === 0
          ? "Nothing to preload — images are already cached or approved."
          : "Searching Serper and caching images…",
    });

    if (targets.length === 0) {
      await updateJob(jobId, {
        status: "completed",
        completed_at: new Date().toISOString(),
        message: "Preload complete",
      });
      return;
    }

    let done = 0;
    let failed = 0;

    for (let index = 0; index < targets.length; index += CONCURRENCY) {
      if (await isJobCancelled(jobId)) {
        await updateJob(jobId, {
          message: "Preload cancelled",
          completed_at: new Date().toISOString(),
        });
        return;
      }

      const chunk = targets.slice(index, index + CONCURRENCY);
      await Promise.all(
        chunk.map(async (product) => {
          const canonicalProductId = product.canonical_product_id as string;

          try {
            const searchQuery = buildSearchQuery(product);
            const candidates = await searchSerper(
              origin,
              cookieHeader,
              searchQuery,
              product.canonical_products?.normalized_name || product.description,
              product.brand || product.manufacturer_name,
            );

            if (candidates.length === 0) {
              await supabase
                .from("canonical_products")
                .update({
                  serper_candidates: [],
                  serper_candidates_search_query: searchQuery,
                  serper_candidates_fetched_at: new Date().toISOString(),
                  serper_ai_selection: null,
                  image_review_status: "no_results",
                })
                .eq("id", canonicalProductId);
            } else {
              const aiSelection = await selectAiCandidates(
                origin,
                cookieHeader,
                product,
                candidates,
              );

              await supabase
                .from("canonical_products")
                .update({
                  serper_candidates: candidates,
                  serper_candidates_search_query: searchQuery,
                  serper_candidates_fetched_at: new Date().toISOString(),
                  serper_ai_selection: aiSelection,
                  image_review_status: aiSelection ? "recommended" : "in_review",
                })
                .eq("id", canonicalProductId);
            }
          } catch (error) {
            failed += 1;
            console.error(
              "[category-preload-job] product failed",
              canonicalProductId,
              error instanceof Error ? error.message : error,
            );
          } finally {
            done += 1;
            await updateJob(jobId, {
              done,
              failed,
              message: "Searching Serper and caching images…",
            });
          }
        }),
      );
    }

    await updateJob(jobId, {
      status: "completed",
      done,
      failed,
      message: "Preload complete",
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preload failed";
    console.error("[category-preload-job]", jobId, message);
    await updateJob(jobId, {
      status: "failed",
      error_message: message,
      message,
      completed_at: new Date().toISOString(),
    });
  }
}
