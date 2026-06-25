/**
 * Specials Carousel types
 *
 * The AI-driven, auto-rotating store specials feature. A store configures a
 * cadence (daily/weekly), a grouping strategy and discount appetite; the engine
 * proposes discounted products from Lightspeed economics + sell-through and
 * curates them with AI into a pipeline of upcoming "cycles" (rotations).
 */

export type SpecialsCadence = 'daily' | 'weekly';

export type SpecialsStrategy =
  | 'random'
  | 'single_category'
  | 'one_per_category'
  | 'clearance';

export type SpecialsSelectionMode = 'auto' | 'manual';

export type SpecialsCycleStatus = 'upcoming' | 'active' | 'expired' | 'skipped';

export type SpecialsSource = 'ai' | 'heuristic' | 'manual';

export const SPECIALS_STRATEGY_LABELS: Record<SpecialsStrategy, string> = {
  random: 'Mixed picks',
  single_category: 'One category',
  one_per_category: 'One per category',
  clearance: 'Clearance',
};

export const SPECIALS_STRATEGY_DESCRIPTIONS: Record<SpecialsStrategy, string> = {
  random: 'A varied set of unrelated products each cycle.',
  single_category: 'A themed set from one rotating category (e.g. 5 lights).',
  one_per_category: 'One product from each of several different categories.',
  clearance: 'The slowest movers and most overstocked lines.',
};

export interface SpecialsConfig {
  user_id: string;
  is_enabled: boolean;
  cadence: SpecialsCadence;
  rotation_hour: number;
  rotation_weekday: number;
  timezone: string;
  strategy: SpecialsStrategy;
  selection_mode: SpecialsSelectionMode;
  products_per_cycle: number;
  category_count: number;
  min_discount_percent: number;
  max_discount_percent: number;
  min_margin_floor_percent: number;
  discount_aggressiveness: number;
  stale_days_threshold: number;
  min_cooldown_cycles: number;
  ai_enabled: boolean;
  carousel_title: string;
  carousel_subtitle: string | null;
  carousel_category_id: string | null;
  last_rotated_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SpecialsConfigUpdate = Partial<
  Omit<
    SpecialsConfig,
    'user_id' | 'carousel_category_id' | 'last_rotated_at' | 'created_at' | 'updated_at'
  >
>;

/** Per-product Lightspeed economics + sell-through used by the discount engine. */
export interface SpecialsProductMetrics {
  product_id: string;
  lightspeed_item_id: string | null;
  display_name: string;
  category_name: string | null;
  lightspeed_category_id: string | null;
  brand: string | null;
  image_url: string | null;
  retail: number;
  cost: number;
  soh: number;
  margin_percent: number | null;
  last_sold_at: string | null;
  days_since_sold: number | null;
  units_sold_90d: number;
  units_sold_300d: number;
}

/** A discount proposal produced by the deterministic engine (pre-AI). */
export interface SpecialsDiscountProposal {
  discount_percent: number;
  sale_price: number;
  /** 0..1 — how strong a clearance candidate this is (drives ordering + AI hints). */
  clearance_score: number;
  reason: string;
}

export interface SpecialsCandidate extends SpecialsProductMetrics {
  proposal: SpecialsDiscountProposal;
}

export interface SpecialsCycleItem {
  id: string;
  cycle_id: string;
  user_id: string;
  product_id: string;
  lightspeed_item_id: string | null;
  position: number;
  retail: number;
  cost: number;
  soh: number;
  last_sold_at: string | null;
  days_since_sold: number | null;
  units_sold_90d: number;
  units_sold_300d: number;
  margin_percent: number | null;
  proposed_discount_percent: number;
  proposed_sale_price: number;
  final_discount_percent: number | null;
  ai_reason: string | null;
  source: SpecialsSource;
  is_pinned: boolean;
  is_removed: boolean;
  created_at?: string;
  updated_at?: string;
}

/** A cycle item joined with live product display fields for the dashboard tables. */
export interface SpecialsCycleItemView extends SpecialsCycleItem {
  display_name: string;
  category_name: string | null;
  brand: string | null;
  image_url: string | null;
  /** Convenience: the discount actually in effect (final ?? proposed). */
  effective_discount_percent: number;
  effective_sale_price: number;
}

export interface SpecialsCycle {
  id: string;
  user_id: string;
  cycle_index: number;
  status: SpecialsCycleStatus;
  starts_at: string;
  ends_at: string;
  cadence: SpecialsCadence;
  strategy: SpecialsStrategy;
  generated_by: SpecialsSource;
  theme_label: string | null;
  ai_rationale: string | null;
  item_count: number;
  activated_at: string | null;
  expired_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SpecialsCycleWithItems extends SpecialsCycle {
  items: SpecialsCycleItemView[];
}

/** Per-product performance over a cycle's live window (requirement: analytics). */
export interface SpecialsProductPerformance {
  product_id: string;
  display_name: string;
  image_url: string | null;
  cycle_id: string;
  cycle_index: number;
  impressions: number;
  clicks: number;
  add_to_cart: number;
  ctr: number;
  discount_percent: number;
  sale_price: number;
}

export interface SpecialsAnalyticsSummary {
  total_impressions: number;
  total_clicks: number;
  total_add_to_cart: number;
  ctr: number;
  products: SpecialsProductPerformance[];
}
