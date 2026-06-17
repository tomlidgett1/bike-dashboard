import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// For You feed — shared types
// ============================================================

export interface ForYouIdentity {
  userId: string | null;
  anonymousId: string | null;
  sessionId?: string | null;
}

export interface WeightedValue {
  value: string;
  weight: number;
}

export interface RecentProductSignal {
  product_id: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  price: number | null;
  store_id: string | null;
  pickup_location: string | null;
  weight: number;
  last_at: string;
}

export interface PriceBand {
  p25: number | null;
  p50: number | null;
  p75: number | null;
  n: number;
}

/** Compact behavioural summary — the single input to ranking and the LLM. */
export interface BehaviouralSignals {
  recentProducts: RecentProductSignal[];
  categories: WeightedValue[];
  subcategories: Array<WeightedValue & { category?: string | null }>;
  brands: WeightedValue[];
  stores: WeightedValue[];
  priceBand: PriceBand;
  searches: string[];
  /** Repeatedly shown, never engaged — soft suppression */
  ignoredProductIds: string[];
  /** Explicit "not interested" — hard suppression */
  dismissedProductIds: string[];
  hiddenCarouselKeys: string[];
  followedStoreIds: string[];
  onboarding: {
    riding_styles?: string[];
    preferred_brands?: string[];
    budget_range?: string;
    interests?: string[];
  } | null;
  totals: { events: number; products: number };
}

export interface ForYouCarouselDef {
  key: string;
  title: string;
  explanation?: string;
  source: "deterministic" | "llm";
  productIds: string[];
}

/** Carousel hydrated with full card data, ready for the UI. */
export interface ForYouCarousel {
  key: string;
  title: string;
  explanation?: string;
  source: "deterministic" | "llm";
  products: MarketplaceProduct[];
}

export interface ForYouFeedPayload {
  feedId: string;
  carousels: ForYouCarousel[];
  /** Random extras from the same categories as the carousels — shown after the last row. */
  moreProducts: MarketplaceProduct[];
  personalised: boolean;
  source: "deterministic" | "llm";
  generatedAt: string;
  /** True when an LLM pass may still improve this feed. */
  enhanceable: boolean;
}

/** Shape stored in for_you_feeds.feed */
export interface StoredFeed {
  carousels: ForYouCarouselDef[];
  summary: LlmBehaviouralSummary;
  personalised: boolean;
}

/** Trimmed summary that is safe + compact enough to hand to the LLM. */
export interface LlmBehaviouralSummary {
  categories: WeightedValue[];
  subcategories: WeightedValue[];
  brands: WeightedValue[];
  priceBand: PriceBand;
  searches: string[];
  recentTitles: string[];
  ridingStyles: string[];
  eventCount: number;
}
