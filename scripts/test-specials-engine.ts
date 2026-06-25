/**
 * Unit checks for the specials discount engine + cycle windows (pure logic, no DB).
 * Run: npx tsx scripts/test-specials-engine.ts
 */
import {
  proposeDiscount,
  marginAtDiscount,
  discountCeilingPercent,
} from '../src/lib/store/specials/discount-engine';
import { computeCycleWindows } from '../src/lib/store/specials/cycle-window';
import { selectCandidates } from '../src/lib/store/specials/selection';
import type {
  SpecialsConfig,
  SpecialsProductMetrics,
  SpecialsCandidate,
} from '../src/lib/types/specials';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const config: SpecialsConfig = {
  user_id: 'u',
  is_enabled: true,
  cadence: 'weekly',
  rotation_hour: 3,
  rotation_weekday: 0,
  timezone: 'Australia/Melbourne',
  strategy: 'random',
  selection_mode: 'auto',
  products_per_cycle: 5,
  category_count: 5,
  min_discount_percent: 10,
  max_discount_percent: 50,
  min_margin_floor_percent: 15,
  discount_aggressiveness: 0.5,
  stale_days_threshold: 90,
  min_cooldown_cycles: 4,
  ai_enabled: false,
  carousel_title: 'Specials',
  carousel_subtitle: null,
  carousel_category_id: null,
  last_rotated_at: null,
};

function metrics(over: Partial<SpecialsProductMetrics>): SpecialsProductMetrics {
  return {
    product_id: 'p',
    lightspeed_item_id: 'i',
    display_name: 'Test',
    category_name: 'Lights',
    lightspeed_category_id: 'c1',
    brand: 'Brand',
    image_url: null,
    retail: 100,
    cost: 50,
    soh: 5,
    margin_percent: 50,
    last_sold_at: null,
    days_since_sold: null,
    units_sold_90d: 0,
    units_sold_300d: 0,
    ...over,
  };
}

console.log('Discount engine:');

// 1. Brief's example: 50% margin, never sold → heavy discount, margin protected.
{
  const m = metrics({ retail: 100, cost: 50, margin_percent: 50, days_since_sold: 320, units_sold_90d: 0 });
  const p = proposeDiscount(m, config);
  check('stale high-margin item gets a strong discount', p.discount_percent >= 30, `got ${p.discount_percent}%`);
  const marginAfter = marginAtDiscount(100, 50, p.discount_percent);
  check('discount never breaches margin floor', (marginAfter ?? 0) >= config.min_margin_floor_percent - 0.5, `margin after ${marginAfter}%`);
  check('clearance score high for never-sold', p.clearance_score >= 0.6, `score ${p.clearance_score}`);
}

// 2. Healthy fast-mover → little or no discount.
{
  const m = metrics({ retail: 100, cost: 50, margin_percent: 50, days_since_sold: 3, units_sold_90d: 12, soh: 2 });
  const p = proposeDiscount(m, config);
  check('healthy fast-mover gets small/no discount', p.discount_percent <= 20, `got ${p.discount_percent}%`);
}

// 3. Low-margin item → discount capped to protect floor (often 0 → filtered out).
{
  const m = metrics({ retail: 100, cost: 90, margin_percent: 10, days_since_sold: 400 });
  const p = proposeDiscount(m, config);
  const marginAfter = marginAtDiscount(100, 90, p.discount_percent);
  check('low-margin item cannot breach floor', p.discount_percent === 0 || (marginAfter ?? 0) >= config.min_margin_floor_percent - 0.5, `disc ${p.discount_percent}% margin ${marginAfter}%`);
}

// 4. Ceiling respects configured max.
{
  const m = metrics({ retail: 1000, cost: 10, margin_percent: 99, days_since_sold: 999, units_sold_90d: 0, soh: 50 });
  const p = proposeDiscount(m, config);
  check('discount never exceeds configured max', p.discount_percent <= config.max_discount_percent, `got ${p.discount_percent}%`);
  check('ceiling helper agrees', discountCeilingPercent(m, config) <= config.max_discount_percent);
}

// 5. Sale price math.
{
  const m = metrics({ retail: 200, cost: 80 });
  const p = proposeDiscount(m, config);
  const expected = Math.round(200 * (1 - p.discount_percent / 100) * 100) / 100;
  check('sale price = retail × (1 − discount)', p.sale_price === expected, `${p.sale_price} vs ${expected}`);
}

console.log('Cycle windows:');

// 6. Daily windows are contiguous and the first contains "now".
{
  const now = new Date('2026-06-25T10:00:00Z');
  const windows = computeCycleWindows({ ...config, cadence: 'daily' }, 4, now);
  check('produces 4 windows', windows.length === 4, `got ${windows.length}`);
  check('first window contains now', windows[0].starts_at <= now.toISOString() && now.toISOString() < windows[0].ends_at);
  check('windows are contiguous', windows[0].ends_at === windows[1].starts_at && windows[1].ends_at === windows[2].starts_at);
  const dayMs = new Date(windows[1].starts_at).getTime() - new Date(windows[0].starts_at).getTime();
  check('daily window ≈ 24h', Math.abs(dayMs - 24 * 3600 * 1000) < 2 * 3600 * 1000, `${dayMs / 3600000}h`);
}

// 7. Weekly windows are ~7 days apart.
{
  const now = new Date('2026-06-25T10:00:00Z');
  const windows = computeCycleWindows({ ...config, cadence: 'weekly' }, 3, now);
  const weekMs = new Date(windows[1].starts_at).getTime() - new Date(windows[0].starts_at).getTime();
  check('weekly window ≈ 7 days', Math.abs(weekMs - 7 * 24 * 3600 * 1000) < 2 * 3600 * 1000, `${weekMs / 86400000}d`);
}

console.log('Selection strategies:');

// 8. one_per_category picks distinct categories.
{
  const mk = (id: string, cat: string, score: number): SpecialsCandidate => ({
    ...metrics({ product_id: id, lightspeed_category_id: cat, category_name: cat }),
    proposal: { discount_percent: 20, sale_price: 80, clearance_score: score, reason: '' },
  });
  const candidates = [
    mk('a', 'c1', 0.9),
    mk('b', 'c1', 0.8),
    mk('c', 'c2', 0.7),
    mk('d', 'c3', 0.6),
  ];
  const res = selectCandidates(candidates, { strategy: 'one_per_category', products_per_cycle: 3 });
  const cats = new Set(res.selected.map((c) => c.lightspeed_category_id));
  check('one_per_category → distinct categories', cats.size === res.selected.length && res.selected.length === 3, `${res.selected.length} picks, ${cats.size} cats`);
}

// 9. single_category → all same category + theme label.
{
  const mk = (id: string, cat: string, score: number): SpecialsCandidate => ({
    ...metrics({ product_id: id, lightspeed_category_id: cat, category_name: cat }),
    proposal: { discount_percent: 20, sale_price: 80, clearance_score: score, reason: '' },
  });
  const candidates = [mk('a', 'Lights', 0.9), mk('b', 'Lights', 0.85), mk('c', 'Tyres', 0.5)];
  const res = selectCandidates(candidates, { strategy: 'single_category', products_per_cycle: 5 });
  const cats = new Set(res.selected.map((c) => c.category_name));
  check('single_category → one category', cats.size === 1, `cats ${[...cats].join(',')}`);
  check('single_category → theme label set', !!res.themeLabel, `label ${res.themeLabel}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
