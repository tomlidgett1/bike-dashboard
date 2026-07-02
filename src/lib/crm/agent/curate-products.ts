// Step 3: Curate products from catalogue — ranked search + GPT re-rank + promo pricing.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentProductPick, AudienceRule, CrmAgentBrief } from "./types";
import { PRODUCT_RANK_INSTRUCTIONS } from "./prompts";
import { PRODUCT_RANK_JSON_SCHEMA } from "./schemas";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI, parseJsonFromModel } from "./openai";
import {
  catalogRowToPick,
  resolveCrmProductImageUrl,
  searchCatalogProducts,
  type CatalogProductRow,
} from "../product-catalog";
import { productMatchesBrand } from "../item-pricing";
import { resolveLivePrice } from "@/lib/marketplace/pricing";

async function rankProductsWithGpt(
  brief: CrmAgentBrief,
  candidates: CatalogProductRow[],
): Promise<string[]> {
  if (candidates.length <= 3) return candidates.map((c) => String(c.id));

  const openai = getCrmOpenAI();
  const response = await openai.responses.create({
    model: CRM_AGENT_MODEL,
    instructions: PRODUCT_RANK_INSTRUCTIONS,
    text: {
      format: {
        type: "json_schema",
        name: "product_rank",
        strict: true,
        schema: PRODUCT_RANK_JSON_SCHEMA,
      },
    },
    input: JSON.stringify({
      campaign_goal: brief.campaign_goal,
      product_focus: brief.product_focus,
      promotion: brief.promo,
      candidates: candidates.slice(0, 24).map((c) => {
        const live = resolveLivePrice({
          price: c.price ?? 0,
          sale_price: c.sale_price ?? null,
          discount_percent: c.discount_percent ?? null,
          discount_active: c.discount_active ?? false,
          discount_ends_at: c.discount_ends_at ?? null,
        });
        return {
          id: c.id,
          name: c.display_name ?? c.description,
          brand: c.manufacturer_name ?? c.brand,
          category: c.category_name ?? c.full_category_path,
          in_stock: Number(c.sellable ?? c.qoh ?? 0) > 0,
          has_image: Boolean(resolveCrmProductImageUrl(c)),
          on_sale: live.onSale,
          percent_off: live.percentOff,
        };
      }),
    }),
  });

  const parsed = parseJsonFromModel<{ ranked_product_ids: string[] }>(extractOutputText(response));
  const validIds = new Set(candidates.map((c) => String(c.id)));
  const ranked =
    parsed?.ranked_product_ids?.filter((id) => validIds.has(String(id))) ??
    candidates.slice(0, 6).map((c) => String(c.id));
  return ranked.length > 0 ? ranked : candidates.slice(0, 6).map((c) => String(c.id));
}

function filterCandidatesForPromo(rows: CatalogProductRow[], brief: CrmAgentBrief): CatalogProductRow[] {
  let pool = rows;

  if (brief.promo.brand) {
    const brandMatches = pool.filter((row) => productMatchesBrand(row, brief.promo.brand!));
    if (brandMatches.length > 0) pool = brandMatches;
  }

  const inStock = pool.filter((row) => Number(row.sellable ?? row.qoh ?? 0) > 0);
  if (inStock.length >= 2) pool = inStock;

  const withImages = pool.filter((row) => resolveCrmProductImageUrl(row));
  if (withImages.length >= 2) pool = withImages;

  return pool;
}

export async function curateProducts(
  supabase: SupabaseClient,
  userId: string,
  brief: CrmAgentBrief,
  audienceRules: AudienceRule[] = [],
): Promise<AgentProductPick[]> {
  if (!brief.include_products) return [];

  const { rows: candidates } = await searchCatalogProducts(
    supabase,
    userId,
    brief,
    audienceRules,
    48,
  );

  if (candidates.length === 0) return [];

  const rankedPool = filterCandidatesForPromo(candidates, brief);
  const rankedIds = await rankProductsWithGpt(brief, rankedPool.slice(0, 24));
  const byId = new Map(rankedPool.map((c) => [String(c.id), c]));

  const picks: AgentProductPick[] = [];
  for (const id of rankedIds) {
    const row = byId.get(id);
    if (!row) continue;
    const pick = catalogRowToPick(row, userId, brief.promo, "Matched your catalogue search");
    if (pick) picks.push(pick);
    if (picks.length >= 6) break;
  }

  if (picks.length === 0) {
    for (const row of rankedPool.slice(0, 8)) {
      const pick = catalogRowToPick(row, userId, brief.promo);
      if (pick) picks.push(pick);
      if (picks.length >= 4) break;
    }
  }

  return picks;
}
