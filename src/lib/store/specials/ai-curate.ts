import OpenAI from 'openai';
import type { SpecialsCandidate, SpecialsConfig } from '@/lib/types/specials';
import {
  SPECIALS_STRATEGY_DESCRIPTIONS,
  SPECIALS_STRATEGY_LABELS,
} from '@/lib/types/specials';
import {
  discountCeilingPercent,
  salePriceForDiscount,
} from '@/lib/store/specials/discount-engine';

/**
 * AI curation of a specials cycle (requirement: "must be AI driven").
 *
 * The deterministic engine does the heavy lifting (scoring + margin-safe
 * discounts); the model is the merchandiser on top: from the scored shortlist it
 * picks the set that best fits the chosen strategy, writes a shopper-facing
 * reason per product, names a theme and explains the cycle. Any discount the
 * model nudges is clamped to the margin-safe ceiling, so AI can never breach the
 * store's minimum margin. Returns null on any failure → caller falls back to the
 * deterministic selection.
 */

const CURATION_MODEL = 'gpt-5.1';
/** Cap how many candidates we hand the model, to bound tokens. */
const MAX_CANDIDATES_FOR_AI = 45;

export interface AiCurationResult {
  selected: SpecialsCandidate[];
  themeLabel: string | null;
  rationale: string | null;
}

interface AiItem {
  product_id?: unknown;
  discount_percent?: unknown;
  reason?: unknown;
}

interface AiResponse {
  theme_label?: unknown;
  rationale?: unknown;
  items?: unknown;
}

function candidateLine(c: SpecialsCandidate): Record<string, unknown> {
  return {
    id: c.product_id,
    name: c.display_name,
    category: c.category_name ?? 'Uncategorised',
    brand: c.brand ?? null,
    retail: c.retail,
    cost: c.cost || null,
    margin_pct: c.margin_percent,
    stock_on_hand: c.soh,
    days_since_last_sold: c.days_since_sold,
    units_sold_90d: c.units_sold_90d,
    units_sold_300d: c.units_sold_300d,
    suggested_discount_pct: c.proposal.discount_percent,
    max_discount_pct: c.proposal.discount_percent, // shown again as the safe ceiling below
    clearance_score: c.proposal.clearance_score,
  };
}

function systemPrompt(config: SpecialsConfig): string {
  return [
    'You are the merchandising brain for a bicycle shop\'s automated "specials" carousel on its online storefront.',
    'Each rotation (cycle) shows a curated set of discounted products to shoppers.',
    'You are given a shortlist of candidate products that the pricing engine already scored and assigned a margin-safe suggested discount.',
    '',
    'Your job:',
    `1. Select exactly ${config.products_per_cycle} products (or fewer only if there genuinely aren\'t enough good ones).`,
    `2. Honour the chosen grouping strategy: "${SPECIALS_STRATEGY_LABELS[config.strategy]}" — ${SPECIALS_STRATEGY_DESCRIPTIONS[config.strategy]}`,
    '3. Prefer products that genuinely need clearing: stale (long since last sold), slow-moving, overstocked, with healthy margin to give back.',
    '4. For each pick, you may keep or slightly adjust the suggested discount, but NEVER exceed the suggested discount (it already protects the minimum margin). You may go lower for a gentler promo.',
    '5. Write a short, concrete shopper-facing reason for each pick (≤ 90 chars), e.g. "Clear winter stock — 30% off".',
    '6. Make the set make sense together for the strategy. Avoid near-duplicates.',
    '',
    'Return JSON only:',
    '{ "theme_label": "<short label or empty>", "rationale": "<1-2 sentences on why this set>", "items": [ { "product_id": "<id>", "discount_percent": <number>, "reason": "<text>" } ] }',
    'Use only product ids from the candidate list. Australian English.',
  ].join('\n');
}

function coerceNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

export async function curateCycleWithAI(
  candidates: SpecialsCandidate[],
  config: SpecialsConfig,
): Promise<AiCurationResult | null> {
  if (!config.ai_enabled) return null;
  if (!process.env.OPENAI_API_KEY) return null;
  if (candidates.length === 0) return null;

  const shortlist = candidates.slice(0, MAX_CANDIDATES_FOR_AI);
  const byId = new Map(shortlist.map((c) => [c.product_id, c]));

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: CURATION_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(config) },
        {
          role: 'user',
          content: [
            `Strategy: ${config.strategy}. Target count: ${config.products_per_cycle}.`,
            'Candidates (already scored, suggested_discount_pct is the margin-safe ceiling — do not exceed it):',
            JSON.stringify(shortlist.map(candidateLine)),
          ].join('\n'),
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as AiResponse;
    const rawItems = Array.isArray(parsed.items) ? (parsed.items as AiItem[]) : [];
    if (rawItems.length === 0) return null;

    const selected: SpecialsCandidate[] = [];
    const seen = new Set<string>();

    for (const item of rawItems) {
      const id = typeof item.product_id === 'string' ? item.product_id : null;
      if (!id || seen.has(id)) continue;
      const base = byId.get(id);
      if (!base) continue;
      seen.add(id);

      // Clamp AI discount to [0, margin-safe ceiling]; default to the engine value.
      const ceiling = discountCeilingPercent(base, config);
      const requested = coerceNumber(item.discount_percent);
      const discount =
        requested == null
          ? base.proposal.discount_percent
          : Math.max(0, Math.min(requested, ceiling, base.proposal.discount_percent));

      const reason =
        typeof item.reason === 'string' && item.reason.trim()
          ? item.reason.trim().slice(0, 120)
          : base.proposal.reason;

      selected.push({
        ...base,
        proposal: {
          ...base.proposal,
          discount_percent: discount,
          sale_price: salePriceForDiscount(base.retail, discount),
          reason,
        },
      });
    }

    if (selected.length === 0) return null;

    return {
      selected: selected.slice(0, config.products_per_cycle),
      themeLabel:
        typeof parsed.theme_label === 'string' && parsed.theme_label.trim()
          ? parsed.theme_label.trim().slice(0, 80)
          : null,
      rationale:
        typeof parsed.rationale === 'string' && parsed.rationale.trim()
          ? parsed.rationale.trim().slice(0, 400)
          : null,
    };
  } catch (error) {
    console.warn('[specials/ai-curate] curation failed, falling back:', error);
    return null;
  }
}
