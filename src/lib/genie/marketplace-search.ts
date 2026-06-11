import type { createClient } from "@/lib/supabase/server";
import { buildCloudinaryImageUrl, extractCloudinaryPublicId } from "@/lib/utils/cloudinary-transforms";

export interface GenieMarketplaceProduct {
  id: string;
  name: string | null;
  category: string | null;
  price: number | string | null;
  qoh: number | null;
  listing_type: string | null;
  condition: string | null;
  image: string | null;
  store_name: string | null;
  product_url: string;
  in_stock: boolean;
}

export interface MarketplaceSearchResult {
  products: GenieMarketplaceProduct[];
  output: {
    found: number;
    products: Array<{
      name: string | null;
      price: string | null;
      quantity: number | null;
      category: string | null;
      condition: string;
      seller: string;
      type: string;
    }>;
    message?: string;
  };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface MarketplaceSearchOptions {
  excludeProductId?: string;
  limit?: number;
}

function toStems(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const stems = new Set<string>();
  for (const w of words) {
    stems.add(w);
    if (w.endsWith("s") && w.length > 3) stems.add(w.slice(0, -1));
    if (w.endsWith("es") && w.length > 4) stems.add(w.slice(0, -2));
    if (w.endsWith("ing") && w.length > 6) stems.add(w.slice(0, -3));
  }
  return Array.from(stems);
}

function emptyResult(message: string): MarketplaceSearchResult {
  return {
    products: [],
    output: { found: 0, products: [], message },
  };
}

function toToolOutput(products: GenieMarketplaceProduct[]): MarketplaceSearchResult["output"] {
  return {
    found: products.length,
    products: products.map((p) => ({
      name: p.name,
      price: p.price ? `$${Number(p.price).toFixed(2)}` : null,
      quantity: p.qoh,
      category: p.category,
      condition: p.condition ?? "New",
      seller: p.store_name ?? "Yellow Jersey seller",
      type: p.listing_type === "store_inventory" ? "Shop stock" : "Private listing",
    })),
  };
}

export async function runMarketplaceSearch(
  supabase: SupabaseServerClient,
  rawQuery: string,
  options: MarketplaceSearchOptions = {},
): Promise<MarketplaceSearchResult> {
  const limit = options.limit ?? 8;

  if (!rawQuery.trim()) {
    return emptyResult("No matching in-stock listings right now.");
  }

  let rankedIds: string[] = [];

  const { data: searchData, error: searchError } = await supabase.rpc("search_marketplace_products", {
    search_query: rawQuery.trim(),
    similarity_threshold: 0.15,
  });

  if (!searchError && searchData && searchData.length > 0) {
    rankedIds = (searchData as Array<{ product_id: string; relevance_score: number }>)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 20)
      .map((r) => r.product_id);
  } else {
    const { data: allProducts } = await supabase
      .from("marketplace_ready_products")
      .select("id, display_name, description, marketplace_category, brand, model")
      .limit(500);

    const stems = toStems(rawQuery);
    const pool = allProducts ?? [];

    rankedIds =
      stems.length > 0
        ? pool
            .map((p) => {
              const haystack = [p.display_name, p.description, p.marketplace_category, p.brand, p.model]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              const score = stems.reduce((n, s) => n + (haystack.includes(s) ? 1 : 0), 0);
              return { id: p.id, score };
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map((x) => x.id)
        : pool.slice(0, 8).map((p) => p.id);
  }

  if (options.excludeProductId) {
    rankedIds = rankedIds.filter((id) => id !== options.excludeProductId);
  }

  if (rankedIds.length === 0) {
    return emptyResult("No matching in-stock listings right now.");
  }

  const { data: products } = await supabase
    .from("marketplace_ready_products")
    .select(`
      id, display_name, description, price, qoh, marketplace_category,
      listing_type, resolved_cloudinary_public_id, resolved_cloudinary_url, resolved_external_url,
      brand, model, condition_rating, user_id
    `)
    .in("id", rankedIds);

  const orderMap = new Map(rankedIds.map((id, i) => [id, i]));
  const ranked = (products ?? [])
    .filter((p) => p.id !== options.excludeProductId)
    .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
    .slice(0, limit);

  if (ranked.length === 0) {
    return emptyResult("No matching in-stock listings right now.");
  }

  const userIds = [...new Set(ranked.map((p) => p.user_id).filter(Boolean))];
  const storeMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: stores } = await supabase
      .from("users")
      .select("user_id, business_name")
      .in("user_id", userIds);
    for (const s of stores ?? []) {
      if (s.business_name) storeMap[s.user_id] = s.business_name;
    }
  }

  const enriched: GenieMarketplaceProduct[] = ranked.map((p) => {
    const qoh = p.qoh ?? 0;
    return {
      id: p.id,
      name: p.display_name ?? p.description,
      category: p.marketplace_category,
      price: p.price,
      qoh: p.qoh,
      listing_type: p.listing_type,
      condition: p.condition_rating,
      image:
        buildCloudinaryImageUrl(
          p.resolved_cloudinary_public_id ?? extractCloudinaryPublicId(p.resolved_cloudinary_url),
          "thumbnail",
        ) ??
        p.resolved_external_url ??
        p.resolved_cloudinary_url ??
        null,
      store_name: p.user_id ? (storeMap[p.user_id] ?? null) : null,
      product_url: `/marketplace/product/${p.id}`,
      in_stock: qoh > 0 || p.listing_type === "private_listing",
    };
  });

  return {
    products: enriched,
    output: toToolOutput(enriched),
  };
}
