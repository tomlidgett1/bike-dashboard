// CRM product catalogue search + image resolution for campaigns.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCloudinaryImageUrl,
  extractCloudinaryPublicId,
} from "@/lib/utils/cloudinary-transforms";
import { resolveProductImage } from "@/lib/services/image-resolver";
import { SITE_URL } from "@/lib/seo/site";
import type { AgentProductPick } from "./agent/types";
import type { CrmAgentBrief, AudienceRule, CrmPromoBrief } from "./agent/types";
import { resolveCampaignItemPricing, productMatchesBrand } from "./item-pricing";
import { resolveLivePrice } from "@/lib/marketplace/pricing";

export type CatalogProductRow = {
  id: string;
  display_name: string | null;
  description: string | null;
  category_name: string | null;
  full_category_path: string | null;
  manufacturer_name: string | null;
  brand: string | null;
  price: number | null;
  sale_price: number | null;
  discount_percent: number | null;
  discount_active: boolean | null;
  discount_ends_at: string | null;
  lightspeed_item_id: string | null;
  qoh: number | null;
  sellable: number | null;
  primary_image_url: string | null;
  cached_image_url: string | null;
  cached_thumbnail_url: string | null;
  resolved_cloudinary_public_id?: string | null;
  resolved_cloudinary_url?: string | null;
  resolved_external_url?: string | null;
  is_active?: boolean | null;
};

const PRODUCT_SELECT = `
  id,
  display_name,
  description,
  category_name,
  full_category_path,
  manufacturer_name,
  brand,
  price,
  sale_price,
  discount_percent,
  discount_active,
  discount_ends_at,
  lightspeed_item_id,
  qoh,
  sellable,
  primary_image_url,
  cached_image_url,
  cached_thumbnail_url,
  is_active
`;

const PRODUCT_SELECT_WITH_IMAGES = `
  ${PRODUCT_SELECT},
  resolved_cloudinary_public_id,
  resolved_cloudinary_url,
  resolved_external_url
`;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "our",
  "your",
  "with",
  "about",
  "email",
  "customers",
  "customer",
  "who",
  "that",
  "have",
  "has",
  "been",
  "last",
  "years",
  "year",
  "months",
  "month",
  "days",
  "new",
  "all",
  "some",
  "their",
  "them",
  "from",
  "into",
  "over",
  "under",
  "shop",
  "store",
  "bike",
  "bikes",
  "riders",
  "riding",
]);

function formatPrice(row: CatalogProductRow): number | null {
  const sale = Number(row.sale_price);
  const price = Number(row.price);
  if (Number.isFinite(sale) && sale > 0) return sale;
  if (Number.isFinite(price) && price > 0) return price;
  return null;
}

/** Resolve a public HTTPS image URL suitable for email clients. */
export function resolveCrmProductImageUrl(row: CatalogProductRow): string | null {
  const resolved = resolveProductImage({
    cloudinary_public_id:
      row.resolved_cloudinary_public_id ||
      extractCloudinaryPublicId(row.resolved_cloudinary_url ?? undefined),
    cloudinary_url: row.resolved_cloudinary_url ?? undefined,
    external_url: row.resolved_external_url ?? undefined,
    approval_status: "approved",
  });

  const candidates = [
    resolved?.gallery_url,
    resolved?.card_url,
    resolved?.mobile_hero_url,
    resolved?.detail_url,
    resolved?.original_url,
    row.cached_image_url,
    row.primary_image_url,
    row.cached_thumbnail_url,
    row.resolved_cloudinary_url,
    row.resolved_external_url,
    row.resolved_cloudinary_public_id
      ? buildCloudinaryImageUrl(row.resolved_cloudinary_public_id, "web_hero")
      : null,
  ];

  for (const url of candidates) {
    const trimmed = String(url ?? "").trim();
    if (/^https:\/\//i.test(trimmed)) return trimmed;
  }
  return null;
}

function tokenizeSearchText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/** Build focused catalogue search queries from the campaign brief. */
export function buildProductSearchQueries(
  brief: CrmAgentBrief,
  audienceRules: AudienceRule[] = [],
): string[] {
  const queries = new Set<string>();

  if (brief.promo.brand) queries.add(brief.promo.brand);
  if (brief.promo.keyword && brief.promo.keyword !== brief.promo.brand) {
    queries.add(brief.promo.keyword);
  }

  const focus = brief.product_focus.trim();
  if (focus) queries.add(focus);

  const goal = brief.campaign_goal.trim();
  if (goal && goal !== focus) queries.add(goal);

  for (const rule of audienceRules) {
    if (
      (rule.type === "purchased_category" ||
        rule.type === "purchased_brand" ||
        rule.type === "purchased_keyword") &&
      rule.value
    ) {
      queries.add(String(rule.value));
    }
  }

  const tokens = tokenizeSearchText(`${focus} ${goal}`.trim());
  if (tokens.length >= 2) {
    queries.add(tokens.slice(0, 4).join(" "));
    if (tokens.length >= 3) {
      queries.add(tokens.filter((t) => t.length >= 4).slice(0, 3).join(" "));
    }
  }

  return [...queries].filter((q) => q.trim().length >= 2).slice(0, 5);
}

async function searchBrandCatalog(
  supabase: SupabaseClient,
  userId: string,
  brand: string,
  limit = 40,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const term = brand.replace(/[%_]/g, "").trim();
  if (!term) return scores;

  const { data, error } = await supabase
    .from("products")
    .select("id, display_name, manufacturer_name, brand")
    .eq("user_id", userId)
    .eq("is_active", true)
    .or(
      `manufacturer_name.ilike.%${term}%,brand.ilike.%${term}%,display_name.ilike.%${term}%,description.ilike.%${term}%`,
    )
    .limit(limit);

  if (error) {
    console.warn("[crm] brand search failed:", error.message);
    return scores;
  }

  for (const row of data ?? []) {
    if (productMatchesBrand(row as CatalogProductRow, brand)) {
      scores.set(String(row.id), 120);
    }
  }
  return scores;
}

async function searchCatalog(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit = 40,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const { data, error } = await supabase.rpc("search_user_products_catalog", {
    p_user_id: userId,
    p_search: query,
    p_limit: limit,
  });
  if (error) {
    console.warn("[crm] catalog search failed:", error.message);
    return scores;
  }

  for (const row of data ?? []) {
    const id = String((row as { product_id: string }).product_id);
    const relevance = Number((row as { relevance: number }).relevance) || 0;
    scores.set(id, Math.max(scores.get(id) ?? 0, relevance));
  }
  return scores;
}

async function loadProductsByIds(
  supabase: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<CatalogProductRow[]> {
  if (ids.length === 0) return [];

  const { data: fromReady, error: readyError } = await supabase
    .from("marketplace_ready_products")
    .select(PRODUCT_SELECT_WITH_IMAGES)
    .eq("user_id", userId)
    .in("id", ids.slice(0, 80));

  if (!readyError && (fromReady?.length ?? 0) > 0) {
    const byId = new Map((fromReady as CatalogProductRow[]).map((row) => [String(row.id), row]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as CatalogProductRow[];
    if (ordered.length > 0) return ordered;
  }

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("user_id", userId)
    .in("id", ids.slice(0, 80));
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [String((row as CatalogProductRow).id), row as CatalogProductRow]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as CatalogProductRow[];
}

function scoreProductRow(
  row: CatalogProductRow,
  baseRelevance: number,
  tokens: string[],
  promo: CrmPromoBrief,
): number {
  let score = baseRelevance;
  const haystack = [
    row.display_name,
    row.description,
    row.category_name,
    row.full_category_path,
    row.manufacturer_name,
    row.brand,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const token of tokens) {
    if (haystack.includes(token)) score += 8;
  }

  if (promo.brand && productMatchesBrand(row, promo.brand)) score += 80;

  const live = resolveLivePrice({
    price: row.price ?? 0,
    sale_price: row.sale_price ?? null,
    discount_percent: row.discount_percent ?? null,
    discount_active: row.discount_active ?? false,
    discount_ends_at: row.discount_ends_at ?? null,
  });
  if (live.onSale) score += 25;
  if (promo.discount_percent && live.percentOff === promo.discount_percent) score += 40;

  const stock = Number(row.sellable ?? row.qoh ?? 0);
  if (stock > 0) score += 12;
  else score -= 20;

  if (row.is_active === false) score -= 100;
  if (resolveCrmProductImageUrl(row)) score += 6;

  return score;
}

export function catalogRowToPick(
  row: CatalogProductRow,
  userId: string,
  promo: CrmPromoBrief,
  reason?: string,
): AgentProductPick | null {
  const pricing = resolveCampaignItemPricing(row, promo);
  if (!pricing) return null;

  const name = String(row.display_name ?? row.description ?? "").trim() || "Product";
  const subtitle = [row.manufacturer_name, row.brand, row.category_name]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");

  return {
    title: name,
    subtitle: subtitle || undefined,
    price: pricing.price,
    originalPrice: pricing.originalPrice,
    badge: pricing.badge,
    discountPercent: pricing.discountPercent,
    onSale: pricing.onSale,
    imageUrl: resolveCrmProductImageUrl(row) ?? undefined,
    url: `${SITE_URL}/marketplace/product/${row.id}?store=${userId}`,
    lightspeedItemId: row.lightspeed_item_id ?? undefined,
    productId: String(row.id),
    reason,
  };
}

export async function searchCatalogProducts(
  supabase: SupabaseClient,
  userId: string,
  brief: CrmAgentBrief,
  audienceRules: AudienceRule[] = [],
  limit = 48,
): Promise<{ rows: CatalogProductRow[]; scores: Map<string, number> }> {
  const queries = buildProductSearchQueries(brief, audienceRules);
  const mergedScores = new Map<string, number>();

  if (queries.length === 0) {
    queries.push(brief.campaign_goal.trim() || "bicycle");
  }

  const searchJobs: Array<Promise<Map<string, number>>> = queries.map((query) =>
    searchCatalog(supabase, userId, query, 40),
  );
  if (brief.promo.brand) {
    searchJobs.push(searchBrandCatalog(supabase, userId, brief.promo.brand, 60));
  }

  const searchResults = await Promise.all(searchJobs);
  for (const results of searchResults) {
    for (const [id, relevance] of results) {
      mergedScores.set(id, Math.max(mergedScores.get(id) ?? 0, relevance));
    }
  }

  if (mergedScores.size === 0 && queries[0]) {
    const tokens = tokenizeSearchText(queries[0]);
    if (tokens.length > 0) {
      const fallback = await searchCatalog(supabase, userId, tokens[0], 30);
      for (const [id, relevance] of fallback) mergedScores.set(id, relevance);
    }
  }

  const rankedIds = [...mergedScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const rows = await loadProductsByIds(supabase, userId, rankedIds);
  const tokens = tokenizeSearchText(queries.join(" "));

  const rescored = rows
    .map((row) => ({
      row,
      score: scoreProductRow(row, mergedScores.get(String(row.id)) ?? 0, tokens, brief.promo),
    }))
    .filter((entry) => entry.score > -50)
    .sort((a, b) => b.score - a.score);

  const finalScores = new Map<string, number>();
  for (const entry of rescored) {
    finalScores.set(String(entry.row.id), entry.score);
  }

  return {
    rows: rescored.map((entry) => entry.row),
    scores: finalScores,
  };
}
