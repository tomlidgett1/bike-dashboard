import { numberFromDb } from "@/lib/marketplace/public-card-feed";
import type { PublicMarketplaceCardRow } from "@/lib/marketplace/public-card-feed";
import type { Candidate, CandidateMap } from "./candidates";
import type {
  BehaviouralSignals,
  ForYouCarouselDef,
  LlmBehaviouralSummary,
} from "./types";

// ============================================================
// Deterministic feed builder
// ============================================================
// Pure functions: (signals, candidates) -> ranked carousels. No I/O, no LLM.
// Good enough to ship on its own; the LLM layer only reshapes this output.

const MIN_CAROUSEL_ITEMS = 4;
const MAX_CAROUSEL_ITEMS = 14;
const MAX_CAROUSELS = 9;
const MAX_PRODUCT_FREQUENCY = 2; // how many carousels one product may appear in
const MAX_OVERLAP_RATIO = 0.5; // drop carousels mostly duplicating earlier ones

interface ScoredCandidate extends Candidate {
  score: number;
  price: number;
  ageDays: number;
  viewedRecently: boolean;
}

function normaliseWeights(values: Array<{ value: string; weight: number }>): Map<string, number> {
  const max = values.reduce((m, v) => Math.max(m, v.weight), 0);
  const map = new Map<string, number>();
  if (max <= 0) return map;
  for (const v of values) map.set(v.value.toLowerCase(), v.weight / max);
  return map;
}

/** Rough location tokens (suburb/state words) from engaged products. */
function locationTokens(signals: BehaviouralSignals): Set<string> {
  const tokens = new Set<string>();
  for (const p of signals.recentProducts) {
    for (const token of (p.pickup_location || "").split(/[,\s]+/)) {
      const t = token.trim().toLowerCase();
      if (t.length >= 3 && !/^\d+$/.test(t)) tokens.add(t);
    }
  }
  return tokens;
}

export function scoreCandidates(
  signals: BehaviouralSignals,
  candidates: CandidateMap,
): ScoredCandidate[] {
  const catWeights = normaliseWeights(signals.categories);
  const subcatWeights = normaliseWeights(signals.subcategories);
  const brandWeights = normaliseWeights(signals.brands);
  const storeWeights = normaliseWeights(signals.stores);
  const ignored = new Set(signals.ignoredProductIds);
  const viewedIds = new Set(signals.recentProducts.map((p) => p.product_id));
  const followedStores = new Set(signals.followedStoreIds);
  const locTokens = locationTokens(signals);
  const { p25, p50, p75 } = signals.priceBand;
  const maxTrending = Math.max(
    1,
    ...[...candidates.values()].map((c) => c.trendingScore),
  );
  const now = Date.now();

  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates.values()) {
    const { row } = candidate;
    const price = numberFromDb(row.price);
    const ageDays = row.created_at
      ? Math.max(0, (now - new Date(row.created_at).getTime()) / 86400_000)
      : 365;

    let score = 0;

    // Category / subcategory / brand / store affinity
    if (row.marketplace_category) {
      score += 3 * (catWeights.get(row.marketplace_category.toLowerCase()) || 0);
    }
    if (row.marketplace_subcategory) {
      score += 2 * (subcatWeights.get(row.marketplace_subcategory.toLowerCase()) || 0);
    }
    if (row.brand) {
      score += 2 * (brandWeights.get(row.brand.toLowerCase()) || 0);
    }
    if (row.user_id) {
      score += 1.5 * (storeWeights.get(row.user_id.toLowerCase()) || 0);
      if (followedStores.has(row.user_id)) score += 1.5;
    }

    // Price fit against the inferred band
    if (price > 0 && p25 != null && p75 != null && p25 > 0) {
      if (price >= p25 * 0.7 && price <= p75 * 1.3) score += 2;
      else if (price >= p25 * 0.4 && price <= p75 * 2) score += 0.75;
      else if (price > p75 * 3) score -= 1; // way out of budget
    }

    // Freshness
    if (ageDays <= 7) score += 1.5;
    else if (ageDays <= 30) score += 0.75;
    else if (ageDays > 120) score -= 0.5;

    // Marketplace-wide engagement
    score += (candidate.trendingScore / maxTrending) * 1.25;

    // Trust + commercial signals
    if (row.is_verified_bike_store) score += 0.5;
    if (row.discount_active) score += 0.75;

    // Location affinity (token overlap with engaged products' pickup areas)
    if (locTokens.size > 0 && row.pickup_location) {
      const rowTokens = row.pickup_location.toLowerCase();
      for (const token of locTokens) {
        if (rowTokens.includes(token)) {
          score += 1;
          break;
        }
      }
    }

    // Soft suppression: repeatedly shown, never engaged
    if (ignored.has(row.id)) score -= 2;

    // Exploration jitter keeps the feed from calcifying
    score += Math.random() * 0.3;

    scored.push({
      ...candidate,
      score,
      price,
      ageDays,
      viewedRecently: viewedIds.has(row.id),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ============================================================
// Carousel builders
// ============================================================

interface BuilderContext {
  signals: BehaviouralSignals;
  scored: ScoredCandidate[];
  personalised: boolean;
}

interface BuiltCarousel extends ForYouCarouselDef {
  /** Used for ordering carousels on the page. */
  rank: number;
}

function roundPrice(value: number): number {
  if (value >= 5000) return Math.round(value / 1000) * 1000;
  if (value >= 1000) return Math.round(value / 500) * 500;
  if (value >= 200) return Math.round(value / 100) * 100;
  return Math.round(value / 50) * 50;
}

function take(
  items: ScoredCandidate[],
  predicate: (c: ScoredCandidate) => boolean,
  limit = MAX_CAROUSEL_ITEMS,
): ScoredCandidate[] {
  const out: ScoredCandidate[] = [];
  for (const item of items) {
    if (predicate(item)) {
      out.push(item);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function buildCarousels(ctx: BuilderContext): BuiltCarousel[] {
  const { signals, scored, personalised } = ctx;
  const carousels: BuiltCarousel[] = [];
  const topCategory = signals.categories[0]?.value || null;
  const secondCategory = signals.categories[1]?.value || null;
  const topBrand = signals.brands[0]?.value || null;
  const { p50, p75 } = signals.priceBand;
  const engagedStores = new Set([
    ...signals.stores.map((s) => s.value),
    ...signals.followedStoreIds,
  ]);

  const push = (
    key: string,
    title: string,
    rank: number,
    items: ScoredCandidate[],
    explanation?: string,
    minItems = MIN_CAROUSEL_ITEMS,
  ) => {
    if (items.length < minItems) return;
    carousels.push({
      key,
      title,
      explanation,
      source: "deterministic",
      productIds: items.map((c) => c.row.id),
      rank,
    });
  };

  if (personalised) {
    // 1. Top picks — best of everything, excluding what they've already seen.
    push(
      "top-picks",
      "Top picks for you",
      100,
      take(scored, (c) => !c.viewedRecently),
      "Based on what you've been browsing",
    );

    // 2. Pick up where you left off — their actual recent products.
    const viewedOrder = new Map(
      signals.recentProducts.map((p, i) => [p.product_id, i]),
    );
    const recentlyViewed = scored
      .filter((c) => c.viewedRecently)
      .sort((a, b) => (viewedOrder.get(a.row.id) ?? 99) - (viewedOrder.get(b.row.id) ?? 99))
      .slice(0, MAX_CAROUSEL_ITEMS);
    push("recently-viewed", "Pick up where you left off", 95, recentlyViewed, undefined, 3);

    // 3. Per-category interest.
    if (topCategory) {
      push(
        `because-${slugify(topCategory)}`,
        `Because you've been browsing ${topCategory}`,
        90,
        take(scored, (c) => c.row.marketplace_category === topCategory && !c.viewedRecently),
      );
    }
    if (secondCategory) {
      push(
        `because-${slugify(secondCategory)}`,
        `More ${secondCategory} for you`,
        72,
        take(scored, (c) => c.row.marketplace_category === secondCategory && !c.viewedRecently),
      );
    }

    // 4. Budget fit.
    if (p50 && p50 > 0) {
      const cap = roundPrice(p50 * 1.05);
      push(
        "under-budget",
        `Strong value under $${cap.toLocaleString("en-AU")}`,
        80,
        take(
          scored,
          (c) => c.price > 0 && c.price <= cap && !c.viewedRecently,
        ),
      );
    }

    // 5. Worth stretching for — a notch above their band, quality-weighted.
    if (p75 && p75 > 0) {
      push(
        "stretch-picks",
        "Worth stretching for",
        62,
        take(
          scored,
          (c) =>
            c.price > p75 * 1.1 &&
            c.price <= p75 * 2 &&
            !c.viewedRecently &&
            (c.row.is_verified_bike_store === true || c.trendingScore > 0),
        ),
      );
    }

    // 6. Stores they engage with.
    if (engagedStores.size > 0) {
      push(
        "from-your-stores",
        "New from stores you've visited",
        76,
        take(
          scored,
          (c) => !!c.row.user_id && engagedStores.has(c.row.user_id) && !c.viewedRecently,
        ),
      );
    }

    // 7. Brand affinity.
    if (topBrand) {
      push(
        `brand-${slugify(topBrand)}`,
        `More from ${topBrand}`,
        68,
        take(
          scored,
          (c) => (c.row.brand || "").toLowerCase() === topBrand.toLowerCase() && !c.viewedRecently,
        ),
      );
    }
  }

  // Shared carousels (both personalised and cold-start).
  push(
    "just-listed",
    "Just listed",
    personalised ? 58 : 90,
    take(scored, (c) => c.ageDays <= 14 && !c.viewedRecently),
  );

  push(
    "price-drops",
    "Price drops worth a look",
    personalised ? 56 : 80,
    take(scored, (c) => c.row.discount_active === true && !c.viewedRecently),
  );

  push(
    "trending",
    "Popular on Yellow Jersey",
    personalised ? 50 : 95,
    take(scored, (c) => c.pools.has("trending") && !c.viewedRecently),
  );

  push(
    "verified-stores",
    "From verified bike stores",
    personalised ? 46 : 70,
    take(scored, (c) => c.row.is_verified_bike_store === true && !c.viewedRecently),
  );

  if (!personalised) {
    // Cold-start category samplers so the page still feels rich.
    for (const [i, category] of ["Bicycles", "Parts", "Apparel"].entries()) {
      push(
        `sampler-${slugify(category)}`,
        category === "Bicycles" ? "Find your next bike" : `Shop ${category}`,
        60 - i * 5,
        take(scored, (c) => c.row.marketplace_category === category),
      );
    }

    // Brand samplers — robust even when category metadata is sparse.
    const brandCounts = new Map<string, ScoredCandidate[]>();
    for (const c of scored) {
      const brand = c.row.brand?.trim();
      if (!brand) continue;
      const list = brandCounts.get(brand) || [];
      list.push(c);
      brandCounts.set(brand, list);
    }
    const topBrands = [...brandCounts.entries()]
      .filter(([, items]) => items.length >= MIN_CAROUSEL_ITEMS)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
    for (const [i, [brand, items]] of topBrands.entries()) {
      push(
        `sampler-brand-${slugify(brand)}`,
        `Shop ${brand}`,
        44 - i * 4,
        items.slice(0, MAX_CAROUSEL_ITEMS),
      );
    }
  } else {
    // Exploration: a category they haven't been browsing.
    const known = new Set(signals.categories.map((c) => c.value));
    const counts = new Map<string, ScoredCandidate[]>();
    for (const c of scored) {
      const cat = c.row.marketplace_category;
      if (!cat || known.has(cat)) continue;
      const list = counts.get(cat) || [];
      list.push(c);
      counts.set(cat, list);
    }
    const best = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (best) {
      push(
        `explore-${slugify(best[0])}`,
        `Worth a look: ${best[0]}`,
        40,
        best[1].slice(0, MAX_CAROUSEL_ITEMS),
        "A little outside your usual browsing",
      );
    }
  }

  return carousels;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================================
// Page assembly: suppression, dedupe, diversity
// ============================================================

export function buildDeterministicFeed(
  signals: BehaviouralSignals,
  candidates: CandidateMap,
): { carousels: ForYouCarouselDef[]; personalised: boolean } {
  // Impressions alone don't make a shopper "known" — require engagement-
  // derived signals before switching off the cold-start experience.
  const personalised =
    signals.recentProducts.length > 0 ||
    signals.categories.length > 0 ||
    signals.brands.length > 0 ||
    signals.searches.length > 0;

  const scored = scoreCandidates(signals, candidates);
  const hidden = new Set(signals.hiddenCarouselKeys);

  let built = buildCarousels({ signals, scored, personalised })
    .filter((c) => !hidden.has(c.key))
    .sort((a, b) => b.rank - a.rank);

  // Thin personal feeds get topped up with the cold-start carousels.
  if (personalised && built.length < 5) {
    const existing = new Set(built.map((c) => c.key));
    const extras = buildCarousels({ signals, scored, personalised: false })
      .filter((c) => !hidden.has(c.key) && !existing.has(c.key))
      .sort((a, b) => b.rank - a.rank);
    built = [...built, ...extras];
  }

  // Global product frequency cap + overlap suppression.
  const frequency = new Map<string, number>();
  const final: ForYouCarouselDef[] = [];
  const seenSets: Set<string>[] = [];

  for (const carousel of built) {
    if (final.length >= MAX_CAROUSELS) break;

    const kept: string[] = [];
    for (const id of carousel.productIds) {
      if ((frequency.get(id) || 0) >= MAX_PRODUCT_FREQUENCY) continue;
      kept.push(id);
    }

    const minItems = carousel.key === "recently-viewed" ? 3 : MIN_CAROUSEL_ITEMS;
    if (kept.length < minItems) continue;

    // Drop carousels that mostly duplicate an earlier one.
    const keptSet = new Set(kept);
    const overlaps = seenSets.some((prev) => {
      let overlap = 0;
      for (const id of keptSet) if (prev.has(id)) overlap++;
      return overlap / keptSet.size > MAX_OVERLAP_RATIO;
    });
    if (overlaps) continue;

    for (const id of kept) frequency.set(id, (frequency.get(id) || 0) + 1);
    seenSets.push(keptSet);
    final.push({
      key: carousel.key,
      title: carousel.title,
      explanation: carousel.explanation,
      source: "deterministic",
      productIds: kept,
    });
  }

  return { carousels: final, personalised };
}

// ============================================================
// LLM input summary
// ============================================================

export function buildLlmSummary(
  signals: BehaviouralSignals,
  candidates: CandidateMap,
): LlmBehaviouralSummary {
  const recentTitles: string[] = [];
  for (const p of signals.recentProducts.slice(0, 8)) {
    const candidate = candidates.get(p.product_id);
    const title = candidate?.row.display_name || candidate?.row.description;
    if (title) recentTitles.push(title.slice(0, 70));
  }

  return {
    categories: signals.categories.slice(0, 5),
    subcategories: signals.subcategories
      .slice(0, 6)
      .map(({ value, weight }) => ({ value, weight })),
    brands: signals.brands.slice(0, 5),
    priceBand: signals.priceBand,
    searches: signals.searches.slice(0, 6),
    recentTitles,
    ridingStyles: signals.onboarding?.riding_styles || [],
    eventCount: signals.totals.events,
  };
}
