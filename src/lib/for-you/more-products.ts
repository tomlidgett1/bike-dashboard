import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { isCyclingMarketplaceRow } from "./cycling-filter";
import { MORE_PRODUCTS_LIMIT } from "./constants";
import type { CandidateMap } from "./candidates";
import type { ForYouCarousel } from "./types";

// ============================================================
// Tail section — more products from carousel categories
// ============================================================

const ACTIVE_FILTER = "listing_status.is.null,listing_status.eq.active";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function extractCategoriesFromCarousels(carousels: ForYouCarousel[]): string[] {
  const counts = new Map<string, number>();
  for (const carousel of carousels) {
    for (const product of carousel.products) {
      const category = product.marketplace_category?.trim();
      if (!category) continue;
      counts.set(category, (counts.get(category) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
}

function collectExcludedIds(carousels: ForYouCarousel[], dismissedIds?: Iterable<string>): Set<string> {
  const exclude = new Set(carousels.flatMap((carousel) => carousel.products.map((p) => p.id)));
  for (const id of dismissedIds || []) exclude.add(id);
  return exclude;
}

function hydrateRows(rows: PublicMarketplaceCardRow[], limit: number): MarketplaceProduct[] {
  return shuffle(rows)
    .slice(0, limit)
    .map(transformPublicMarketplaceCard)
    .filter((product) => !!product.primary_image_url);
}

/** Build the tail grid from the same validated candidate pool used for carousels. */
export function pickMoreProductsFromCandidates(
  carousels: ForYouCarousel[],
  candidates: CandidateMap,
  options: { dismissedIds?: Iterable<string>; limit?: number } = {},
): MarketplaceProduct[] {
  const limit = options.limit ?? MORE_PRODUCTS_LIMIT;
  if (carousels.length === 0) return [];

  const categories = new Set(extractCategoriesFromCarousels(carousels));
  const exclude = collectExcludedIds(carousels, options.dismissedIds);

  const pool = [...candidates.values()].filter((candidate) => {
    if (exclude.has(candidate.row.id)) return false;
    if (!isCyclingMarketplaceRow(candidate.row)) return false;
    if (categories.size === 0) return true;
    const category = candidate.row.marketplace_category;
    return !!category && categories.has(category);
  });

  return hydrateRows(
    pool.map((candidate) => candidate.row),
    limit,
  );
}

/** Cached-feed path — query live inventory in the carousel categories. */
export async function fetchMoreProductsForFeed(
  carousels: ForYouCarousel[],
  options: { dismissedIds?: Iterable<string>; limit?: number } = {},
): Promise<MarketplaceProduct[]> {
  const limit = options.limit ?? MORE_PRODUCTS_LIMIT;
  if (carousels.length === 0) return [];

  const categories = extractCategoriesFromCarousels(carousels);
  const queryCategories =
    categories.length > 0 ? categories.slice(0, 5) : ["Bicycles", "Parts", "Apparel"];

  const exclude = collectExcludedIds(carousels, options.dismissedIds);
  const supabase = createPublicSupabaseClient();
  const rows: PublicMarketplaceCardRow[] = [];
  const seen = new Set<string>();

  const results = await Promise.all(
    queryCategories.map((category) =>
      supabase
        .from("public_marketplace_cards")
        .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
        .eq("marketplace_category", category)
        .or(ACTIVE_FILTER)
        .order("created_at", { ascending: false })
        .limit(80),
    ),
  );

  for (const { data, error } of results) {
    if (error && hasMissingPublicCardFeedError(error)) continue;
    for (const row of (data || []) as PublicMarketplaceCardRow[]) {
      if (exclude.has(row.id) || seen.has(row.id)) continue;
      if (!isCyclingMarketplaceRow(row)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }

  return hydrateRows(rows, limit);
}
