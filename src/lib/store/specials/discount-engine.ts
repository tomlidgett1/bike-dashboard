import type {
  SpecialsConfig,
  SpecialsDiscountProposal,
  SpecialsProductMetrics,
} from '@/lib/types/specials';

/**
 * Deterministic discount engine.
 *
 * Turns a product's Lightspeed economics + sell-through into a proposed discount.
 * The intuition (and the brief's worked example — "50% margin, unsold in 300
 * days → heavily discounted"):
 *
 *   1. Score how badly a product needs clearing (clearance_score, 0..1) from
 *      staleness (days since last sold), velocity (units sold) and overstock.
 *   2. Scale the discount between the configured floor and ceiling by that score
 *      and the store's discount appetite (discount_aggressiveness).
 *   3. NEVER breach the margin floor — cap the discount so the sale price always
 *      keeps at least `min_margin_floor_percent` margin when cost is known.
 *
 * Pure + deterministic → unit-testable without a DB, and used as the fallback
 * whenever AI curation is off or unavailable.
 */

/** Trailing-90d unit sales considered "healthy" (caps the velocity signal). */
const HEALTHY_VELOCITY_90D = 6;
/** SOH considered meaningfully overstocked (caps the overstock signal). */
const OVERSTOCK_UNITS = 10;
/** Discounts are rounded to clean retail steps. */
const DISCOUNT_STEP = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Largest discount fraction (0..1) that still keeps margin ≥ floor. */
function maxDiscountKeepingMargin(retail: number, cost: number, floorPercent: number): number {
  if (retail <= 0) return 0;
  if (cost <= 0) return 1; // unknown/zero cost → no margin constraint
  const floor = clamp(floorPercent, 0, 99) / 100;
  const minSalePrice = cost / (1 - floor);
  if (minSalePrice >= retail) return 0; // can't discount without breaching floor
  return clamp(1 - minSalePrice / retail, 0, 1);
}

/**
 * Clearance score (0..1): how strongly this product should be cleared.
 * Staleness dominates, then velocity, then overstock.
 */
export function clearanceScore(
  metrics: SpecialsProductMetrics,
  staleDaysThreshold: number,
): number {
  const threshold = Math.max(1, staleDaysThreshold);

  // Staleness: never-sold counts as maximally stale; 2× threshold saturates.
  const days = metrics.days_since_sold ?? threshold * 4;
  const staleness = clamp(days / (threshold * 2), 0, 1);

  // Velocity: fewer trailing sales → higher score.
  const velocity = 1 - clamp(metrics.units_sold_90d / HEALTHY_VELOCITY_90D, 0, 1);

  // Overstock: more units sitting on the shelf → higher score.
  const overstock = clamp(metrics.soh / OVERSTOCK_UNITS, 0, 1);

  return clamp(0.55 * staleness + 0.3 * velocity + 0.15 * overstock, 0, 1);
}

function buildReason(
  metrics: SpecialsProductMetrics,
  score: number,
  staleDaysThreshold: number,
): string {
  const parts: string[] = [];

  if (metrics.days_since_sold == null) {
    parts.push('never sold');
  } else if (metrics.days_since_sold >= staleDaysThreshold) {
    parts.push(`no sales in ${metrics.days_since_sold} days`);
  } else if (metrics.units_sold_90d <= 1) {
    parts.push(`slow mover (${metrics.units_sold_90d} sold in 90 days)`);
  } else {
    parts.push(`last sold ${metrics.days_since_sold} days ago`);
  }

  if (metrics.margin_percent != null) {
    parts.push(`${Math.round(metrics.margin_percent)}% margin`);
  }
  if (metrics.soh >= OVERSTOCK_UNITS) {
    parts.push(`${Math.round(metrics.soh)} in stock`);
  }

  const lead =
    score >= 0.66 ? 'Strong clearance candidate' : score >= 0.4 ? 'Good special' : 'Light promo';
  return `${lead}: ${parts.join(' · ')}.`;
}

/** Produce a discount proposal for a single product. */
export function proposeDiscount(
  metrics: SpecialsProductMetrics,
  config: Pick<
    SpecialsConfig,
    | 'min_discount_percent'
    | 'max_discount_percent'
    | 'min_margin_floor_percent'
    | 'discount_aggressiveness'
    | 'stale_days_threshold'
  >,
): SpecialsDiscountProposal {
  const score = clearanceScore(metrics, config.stale_days_threshold);

  const floorPct = clamp(config.min_discount_percent, 0, 100);
  const marginCapPct = maxDiscountKeepingMargin(
    metrics.retail,
    metrics.cost,
    config.min_margin_floor_percent,
  ) * 100;
  const ceilPct = clamp(Math.min(config.max_discount_percent, marginCapPct), 0, 100);

  // Appetite scales the score: 0.5 ≈ neutral, 1 ≈ push hard, 0 ≈ gentle.
  const appetite = clamp(0.4 + 1.2 * config.discount_aggressiveness, 0, 1.6);
  const intensity = clamp(score * appetite, 0, 1);

  let discountPct = ceilPct <= 0 ? 0 : floorPct + intensity * Math.max(0, ceilPct - floorPct);

  // Round to a clean step, then never let rounding breach the margin cap.
  discountPct = Math.round(discountPct / DISCOUNT_STEP) * DISCOUNT_STEP;
  if (discountPct > ceilPct) discountPct = Math.floor(ceilPct / DISCOUNT_STEP) * DISCOUNT_STEP;
  discountPct = clamp(discountPct, 0, 100);

  const salePrice = round2(metrics.retail * (1 - discountPct / 100));

  return {
    discount_percent: discountPct,
    sale_price: salePrice,
    clearance_score: Math.round(score * 1000) / 1000,
    reason: buildReason(metrics, score, config.stale_days_threshold),
  };
}

/**
 * Highest discount % the engine will allow for a product: the configured ceiling
 * capped by the margin floor. Used to clamp AI-chosen and manually-entered
 * discounts so neither can ever breach the store's minimum margin.
 */
export function discountCeilingPercent(
  metrics: Pick<SpecialsProductMetrics, 'retail' | 'cost'>,
  config: Pick<SpecialsConfig, 'max_discount_percent' | 'min_margin_floor_percent'>,
): number {
  const marginCapPct =
    maxDiscountKeepingMargin(metrics.retail, metrics.cost, config.min_margin_floor_percent) * 100;
  return clamp(Math.min(config.max_discount_percent, marginCapPct), 0, 100);
}

/** Compute a sale price for an explicit discount (manual override path). */
export function salePriceForDiscount(retail: number, discountPercent: number): number {
  const pct = clamp(discountPercent, 0, 100);
  return round2(retail * (1 - pct / 100));
}

/** Resulting margin % at a given discount — used to warn on margin-breaching overrides. */
export function marginAtDiscount(
  retail: number,
  cost: number,
  discountPercent: number,
): number | null {
  const sale = salePriceForDiscount(retail, discountPercent);
  if (sale <= 0) return null;
  return Math.round(((sale - cost) / sale) * 1000) / 10;
}
