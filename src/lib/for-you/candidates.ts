import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BehaviouralSignals } from "./types";

// ============================================================
// Candidate selection
// ============================================================
// Pulls several targeted pools from public_marketplace_cards (the denormalised
// materialized view backing the marketplace) and tags each candidate with the
// pools it came from. Everything downstream — deterministic ranking and the
// LLM — can only ever recommend products from this validated pool.

export type CandidatePool =
  | "newest"
  | "category"
  | "brand"
  | "discount"
  | "store"
  | "trending"
  | "budget"
  | "verified";

export interface Candidate {
  row: PublicMarketplaceCardRow;
  pools: Set<CandidatePool>;
  trendingScore: number;
}

export type CandidateMap = Map<string, Candidate>;

const ACTIVE_FILTER = "listing_status.is.null,listing_status.eq.active";

// Same hard gate as llm-similar-products: obvious non-cycling inventory
// (e.g. automotive parts test stores) must never reach the For You feed.
const NON_CYCLING_TITLE =
  /\b(mercedes|bmw|audi|toyota|honda civic|nissan|ford|holden|mazda|volkswagen|porsche|ferrari|lamborghini|automotive|car part|engine oil|motor oil|wiper blade|spark plug|transmission fluid|car battery|vehicle|automobile|abs unit|serpentine belt)\b/i;

function isCyclingRow(row: PublicMarketplaceCardRow): boolean {
  const title = `${row.display_name || ""} ${row.description || ""}`;
  return !NON_CYCLING_TITLE.test(title);
}

export async function fetchCandidates(signals: BehaviouralSignals): Promise<CandidateMap> {
  const supabase = createPublicSupabaseClient();
  const candidates: CandidateMap = new Map();
  const dismissed = new Set(signals.dismissedProductIds);

  const add = (rows: PublicMarketplaceCardRow[] | null | undefined, pool: CandidatePool) => {
    for (const row of rows || []) {
      if (dismissed.has(row.id)) continue; // hard suppression at the source
      if (!isCyclingRow(row)) continue;
      const existing = candidates.get(row.id);
      if (existing) {
        existing.pools.add(pool);
      } else {
        candidates.set(row.id, { row, pools: new Set([pool]), trendingScore: 0 });
      }
    }
  };

  const baseQuery = () =>
    supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .or(ACTIVE_FILTER);

  const queries: Array<PromiseLike<void>> = [];

  // Fresh inventory — always.
  queries.push(
    baseQuery()
      .order("created_at", { ascending: false })
      .limit(150)
      .then(({ data, error }) => {
        if (!error || !hasMissingPublicCardFeedError(error)) {
          add(data as PublicMarketplaceCardRow[], "newest");
        }
      }),
  );

  // Verified bike store inventory — always.
  queries.push(
    baseQuery()
      .eq("is_verified_bike_store", true)
      .order("created_at", { ascending: false })
      .limit(80)
      .then(({ data }) => add(data as PublicMarketplaceCardRow[], "verified")),
  );

  // Discounted — always (price-drop carousel).
  queries.push(
    baseQuery()
      .eq("discount_active", true)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => add(data as PublicMarketplaceCardRow[], "discount")),
  );

  // Top categories from behaviour (or onboarding riding styles for new users).
  const categories = signals.categories.slice(0, 3).map((c) => c.value);
  if (categories.length === 0 && signals.onboarding?.riding_styles?.length) {
    categories.push("Bicycles");
  }
  for (const category of categories) {
    queries.push(
      baseQuery()
        .eq("marketplace_category", category)
        .order("created_at", { ascending: false })
        .limit(80)
        .then(({ data }) => add(data as PublicMarketplaceCardRow[], "category")),
    );
  }

  // Budget-fit inside the strongest category.
  const p50 = signals.priceBand.p50;
  if (categories[0] && p50 && p50 > 0) {
    queries.push(
      baseQuery()
        .eq("marketplace_category", categories[0])
        .gt("price", Math.max(1, p50 * 0.2))
        .lte("price", p50 * 1.1)
        .order("created_at", { ascending: false })
        .limit(60)
        .then(({ data }) => add(data as PublicMarketplaceCardRow[], "budget")),
    );
  }

  // Brand affinity (plus onboarding preferred brands when behaviour is thin).
  const brands = signals.brands.slice(0, 3).map((b) => b.value);
  if (brands.length === 0 && signals.onboarding?.preferred_brands?.length) {
    brands.push(...signals.onboarding.preferred_brands.slice(0, 2));
  }
  for (const brand of brands) {
    queries.push(
      baseQuery()
        .ilike("brand", brand)
        .order("created_at", { ascending: false })
        .limit(40)
        .then(({ data }) => add(data as PublicMarketplaceCardRow[], "brand")),
    );
  }

  // Stores the shopper engaged with or follows.
  const storeIds = [
    ...new Set([
      ...signals.stores.slice(0, 4).map((s) => s.value),
      ...signals.followedStoreIds.slice(0, 4),
    ]),
  ].slice(0, 5);
  for (const storeId of storeIds) {
    queries.push(
      baseQuery()
        .eq("user_id", storeId)
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data }) => add(data as PublicMarketplaceCardRow[], "store")),
    );
  }

  await Promise.all(queries.map((q) => Promise.resolve(q).catch(() => {})));

  // Marketplace-wide engagement (product_scores lives outside the MV).
  try {
    const service = createServiceRoleClient();
    const { data: scores } = await service
      .from("product_scores")
      .select("product_id, trending_score")
      .gt("trending_score", 0)
      .order("trending_score", { ascending: false })
      .limit(100);

    const scoreMap = new Map(
      (scores || []).map((s) => [s.product_id as string, Number(s.trending_score) || 0]),
    );

    // Attach scores to candidates we already have…
    for (const [id, candidate] of candidates) {
      const trending = scoreMap.get(id);
      if (trending) {
        candidate.trendingScore = trending;
        candidate.pools.add("trending");
        scoreMap.delete(id);
      }
    }

    // …and pull in trending products we don't.
    const missingIds = [...scoreMap.keys()].filter((id) => !dismissed.has(id)).slice(0, 60);
    if (missingIds.length > 0) {
      const { data: trendingRows } = await supabase
        .from("public_marketplace_cards")
        .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
        .in("id", missingIds)
        .or(ACTIVE_FILTER);
      for (const row of (trendingRows || []) as PublicMarketplaceCardRow[]) {
        if (dismissed.has(row.id)) continue;
        if (!isCyclingRow(row)) continue;
        candidates.set(row.id, {
          row,
          pools: new Set<CandidatePool>(["trending"]),
          trendingScore: scoreMap.get(row.id) || 0,
        });
      }
    }
  } catch (error) {
    console.error("[for-you] trending pool failed:", error);
  }

  return candidates;
}

/**
 * Re-validate a stored feed's product IDs against live inventory.
 * Returns the set of IDs that are still listed and available.
 */
export async function validateProductIds(ids: string[]): Promise<Map<string, PublicMarketplaceCardRow>> {
  if (ids.length === 0) return new Map();
  const supabase = createPublicSupabaseClient();
  const valid = new Map<string, PublicMarketplaceCardRow>();

  // Chunk to keep the IN() list sane.
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .in("id", chunk)
      .or(ACTIVE_FILTER);
    if (error) {
      console.error("[for-you] validateProductIds failed:", error.message);
      continue;
    }
    for (const row of (data || []) as PublicMarketplaceCardRow[]) {
      valid.set(row.id, row);
    }
  }
  return valid;
}
