import OpenAI from "openai";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  numberFromDb,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";

const SIMILAR_MODEL = "gpt-5.4-nano";
const MAX_CANDIDATES = 80;
const DEFAULT_LIMIT = 12;

/** Obvious non-cycling inventory that must never appear as "similar". */
const NON_CYCLING_TITLE =
  /\b(mercedes|bmw|audi|toyota|honda|nissan|ford|holden|mazda|volkswagen|porsche|ferrari|lamborghini|automotive|car part|engine oil|motor oil|brake pad for car|wiper blade|spark plug|transmission fluid|car battery|vehicle|automobile)\b/i;

const PRODUCT_KIND_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "helmet", pattern: /\bhelmet\b/i },
  { kind: "jersey", pattern: /\bjersey\b|\bjerseys\b/i },
  { kind: "shorts", pattern: /\bshorts\b|\bbib\b/i },
  { kind: "jacket", pattern: /\bjacket\b|\bvest\b|\bgilet\b/i },
  { kind: "gloves", pattern: /\bgloves?\b/i },
  { kind: "shoes", pattern: /\bshoes?\b|\bcleats?\b|\bfootwear\b/i },
  { kind: "wheel", pattern: /\bwheels?\b|\brim\b|\btyre\b|\btire\b/i },
  { kind: "groupset", pattern: /\bgroupset\b|\bshimano\b|\bsram\b|\bcampagnolo\b/i },
  { kind: "bike", pattern: /\bbike\b|\bbicycle\b|\bframe\b|\broad bike\b|\bmtb\b|\bmountain bike\b/i },
];

function productText(source: Pick<SimilarProductSource, "display_name" | "description">): string {
  return `${source.display_name || ""} ${source.description || ""}`.trim();
}

const SUBCATEGORY_KIND: Record<string, string> = {
  Helmets: "helmet",
  Jerseys: "jersey",
  Shorts: "shorts",
  Jackets: "jacket",
  Gloves: "gloves",
  Shoes: "shoes",
};

function inferProductKind(source: SimilarProductSource): string | null {
  if (source.marketplace_subcategory && SUBCATEGORY_KIND[source.marketplace_subcategory]) {
    return SUBCATEGORY_KIND[source.marketplace_subcategory];
  }
  const text = productText(source);
  for (const { kind, pattern } of PRODUCT_KIND_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

function rowTitle(row: PublicMarketplaceCardRow): string {
  return (row.display_name || row.description || "").trim();
}

function isBlockedNonCyclingTitle(title: string): boolean {
  return NON_CYCLING_TITLE.test(title);
}

/**
 * Hard gate: candidate must belong to the same shopping intent as the source.
 * LLM ranking runs only inside this filtered pool.
 */
export function isCompatibleSimilarCandidate(
  source: SimilarProductSource,
  row: PublicMarketplaceCardRow,
  mode: "strict" | "relaxed" = "strict",
): boolean {
  if (row.id === source.id) return false;

  const candidateTitle = rowTitle(row);
  if (!candidateTitle || isBlockedNonCyclingTitle(candidateTitle)) return false;

  // Same top-level marketplace category is mandatory when the source has one.
  if (source.marketplace_category) {
    if (!row.marketplace_category || row.marketplace_category !== source.marketplace_category) {
      return false;
    }
  }

  if (mode === "relaxed") return true;

  const sameSubcategory =
    !!source.marketplace_subcategory &&
    !!row.marketplace_subcategory &&
    row.marketplace_subcategory === source.marketplace_subcategory;

  // Same subcategory (e.g. Apparel › Helmets) is enough — titles often omit "helmet".
  if (sameSubcategory) return true;

  const sourceKind = inferProductKind(source);
  if (!sourceKind) return true;

  const candidateKind = inferProductKind({
    id: row.id,
    display_name: row.display_name,
    description: row.description,
    brand: row.brand,
    price: numberFromDb(row.price) || null,
    marketplace_category: row.marketplace_category,
    marketplace_subcategory: row.marketplace_subcategory,
    marketplace_level_3_category: row.marketplace_level_3_category,
    model_year: row.model_year,
    condition_rating: row.condition_rating ?? null,
  });

  if (candidateKind && candidateKind !== sourceKind) return false;
  if (!candidateKind && !new RegExp(`\\b${sourceKind}s?\\b`, "i").test(candidateTitle)) {
    return false;
  }

  return true;
}

function filterCompatibleCandidates(
  source: SimilarProductSource,
  rows: PublicMarketplaceCardRow[],
  mode: "strict" | "relaxed" = "strict",
): PublicMarketplaceCardRow[] {
  return rows.filter((row) => isCompatibleSimilarCandidate(source, row, mode));
}

export interface SimilarProductSource {
  id: string;
  display_name: string | null;
  description: string | null;
  brand: string | null;
  price: number | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  marketplace_level_3_category: string | null;
  model_year: string | null;
  condition_rating: string | null;
  bike_type?: string | null;
  frame_size?: string | null;
  groupset?: string | null;
  store_account_type?: string | null;
}

function formatPriceAud(price: number | null): string {
  if (price == null || price <= 0) return "—";
  return `$${Math.round(price).toLocaleString("en-AU")}`;
}

function buildSourceSummary(source: SimilarProductSource): string {
  const title = source.display_name || source.description || "Unknown product";
  const lines = [
    `Title: ${title}`,
    source.brand ? `Brand: ${source.brand}` : null,
    source.marketplace_category ? `Category: ${source.marketplace_category}` : null,
    source.marketplace_subcategory ? `Subcategory: ${source.marketplace_subcategory}` : null,
    source.marketplace_level_3_category ? `Type: ${source.marketplace_level_3_category}` : null,
    source.price ? `Price: ${formatPriceAud(source.price)}` : null,
    source.model_year ? `Model year: ${source.model_year}` : null,
    source.condition_rating ? `Condition: ${source.condition_rating}` : null,
    source.bike_type ? `Bike type: ${source.bike_type}` : null,
    source.frame_size ? `Frame size: ${source.frame_size}` : null,
    source.groupset ? `Groupset: ${source.groupset}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

function compactCandidateLine(row: PublicMarketplaceCardRow): string {
  const title = (row.display_name || row.description || "Untitled").slice(0, 80);
  const brand = row.brand || "—";
  const category = [row.marketplace_category, row.marketplace_subcategory]
    .filter(Boolean)
    .join(" › ") || "—";
  const price = formatPriceAud(numberFromDb(row.price));
  const condition = row.condition_rating || "—";
  return `${row.id}|${title}|${brand}|${category}|${price}|${condition}`;
}

const SYSTEM_PROMPT = `You pick similar products for Yellow Jersey — an Australian bicycle marketplace ONLY.

Candidates are pre-filtered to the same product category. Your job is to rank them by shopper similarity (use case, spec tier, price band, brand tier).

Rules:
- ONLY return IDs from the candidate list provided
- NEVER pick automotive, car, or non-cycling products
- For a helmet, pick other helmets/cycling head protection only
- For apparel, pick same apparel type (helmet↔helmet, jersey↔jersey)
- For parts, pick functionally similar parts (same component type)
- For bikes, pick similar bikes (discipline, price tier, material)
- Prefer same subcategory and similar price (±40%) when possible
- Do not return the source product

Return JSON only: { "product_ids": ["uuid", ...] }`;

function normaliseProductIds(raw: unknown, validIds: Set<string>, limit: number): string[] {
  if (!raw || typeof raw !== "object") return [];
  const ids = (raw as { product_ids?: unknown }).product_ids;
  if (!Array.isArray(ids)) return [];

  const seen = new Set<string>();
  return ids
    .filter((id): id is string => typeof id === "string" && validIds.has(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit);
}

async function fetchCandidateRows(
  source: SimilarProductSource,
): Promise<PublicMarketplaceCardRow[]> {
  const supabase = createPublicSupabaseClient();
  const byId = new Map<string, PublicMarketplaceCardRow>();

  const addRows = (rows: PublicMarketplaceCardRow[] | null | undefined) => {
    for (const row of rows || []) {
      if (row.id !== source.id && !byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }
  };

  const fetchByCategory = async (category: string, subcategory?: string | null) => {
    let query = supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .eq("marketplace_category", category)
      .neq("id", source.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (subcategory) {
      query = query.eq("marketplace_subcategory", subcategory);
    }

    const { data, error } = await query;
    if (hasMissingPublicCardFeedError(error)) return;
    if (!error) addRows(data as PublicMarketplaceCardRow[]);
  };

  if (source.marketplace_category) {
    // Prefer same subcategory, then widen to full category.
    if (source.marketplace_subcategory) {
      await fetchByCategory(source.marketplace_category, source.marketplace_subcategory);
    }
    if (byId.size < 12) {
      await fetchByCategory(source.marketplace_category);
    }
  } else {
    // No category on source — recent listings, blocklist applied later.
    const { data, error } = await supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .neq("id", source.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (!error && !hasMissingPublicCardFeedError(error)) {
      addRows(data as PublicMarketplaceCardRow[]);
    }
  }

  if (source.brand?.trim() && source.marketplace_category) {
    const { data, error } = await supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .eq("marketplace_category", source.marketplace_category)
      .ilike("brand", source.brand.trim())
      .neq("id", source.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!error) addRows(data as PublicMarketplaceCardRow[]);
  }

  return Array.from(byId.values()).slice(0, MAX_CANDIDATES);
}

function resolveCandidatePool(
  source: SimilarProductSource,
  raw: PublicMarketplaceCardRow[],
): PublicMarketplaceCardRow[] {
  const strict = filterCompatibleCandidates(source, raw, "strict");
  if (strict.length >= 4) return strict.slice(0, MAX_CANDIDATES);

  const relaxed = filterCompatibleCandidates(source, raw, "relaxed");
  if (relaxed.length > 0) return relaxed.slice(0, MAX_CANDIDATES);

  return [];
}

export function scoreSimilarProductsRuleBased(
  source: SimilarProductSource,
  candidates: PublicMarketplaceCardRow[],
  limit: number,
): MarketplaceProduct[] {
  const sourceBrand = source.brand?.toLowerCase() || null;
  const sourcePrice = source.price ?? 0;
  const sourceKind = inferProductKind(source);

  return candidates
    .filter((row) => isCompatibleSimilarCandidate(source, row, "relaxed"))
    .map((row) => {
      let score = 0;
      const rowPrice = numberFromDb(row.price);
      const title = rowTitle(row).toLowerCase();

      if (
        source.marketplace_level_3_category &&
        row.marketplace_level_3_category === source.marketplace_level_3_category
      ) {
        score += 6;
      }
      if (
        source.marketplace_subcategory &&
        row.marketplace_subcategory === source.marketplace_subcategory
      ) {
        score += 5;
      }
      if (source.marketplace_category && row.marketplace_category === source.marketplace_category) {
        score += 3;
      }
      if (sourceKind && new RegExp(`\\b${sourceKind}s?\\b`, "i").test(title)) {
        score += 4;
      }
      if (
        sourceKind &&
        row.marketplace_subcategory &&
        SUBCATEGORY_KIND[row.marketplace_subcategory] === sourceKind
      ) {
        score += 4;
      }
      if (sourceBrand && row.brand && row.brand.toLowerCase() === sourceBrand) {
        score += 3;
      }
      if (source.condition_rating && row.condition_rating === source.condition_rating) {
        score += 2;
      }
      if (sourcePrice > 0 && rowPrice > 0) {
        const priceDiff = Math.abs(rowPrice - sourcePrice) / sourcePrice;
        if (priceDiff <= 0.3) score += 2;
        else if (priceDiff <= 0.5) score += 1;
      }

      return { row, score };
    })
    .filter(({ score }) => score >= 3)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.row.created_at || 0).getTime() - new Date(a.row.created_at || 0).getTime();
    })
    .slice(0, limit)
    .map(({ row }) => transformPublicMarketplaceCard(row));
}

async function selectSimilarProductIdsWithLlm(
  source: SimilarProductSource,
  candidates: PublicMarketplaceCardRow[],
  limit: number,
): Promise<string[] | null> {
  if (!process.env.OPENAI_API_KEY || candidates.length === 0) return null;

  const validIds = new Set(candidates.map((row) => row.id));
  const candidateLines = candidates.map(compactCandidateLine).join("\n");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: SIMILAR_MODEL,
      temperature: 0.2,
      max_completion_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Pick the ${limit} most similar marketplace listings.`,
            "",
            "Source listing:",
            buildSourceSummary(source),
            "",
            "Candidates (id|title|brand|category|price|condition):",
            candidateLines,
          ].join("\n"),
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as unknown;
    const ids = normaliseProductIds(parsed, validIds, limit);
    return ids.length > 0 ? ids : null;
  } catch (error) {
    console.warn("[llm-similar-products] nano model failed:", error);
    return null;
  }
}

export async function getLlmSimilarProducts(
  source: SimilarProductSource,
  limit: number = DEFAULT_LIMIT,
): Promise<{ products: MarketplaceProduct[]; method: "llm" | "rules" }> {
  const raw = await fetchCandidateRows(source);
  const candidates = resolveCandidatePool(source, raw);

  if (candidates.length === 0) {
    return { products: [], method: "rules" };
  }

  const llmIds = await selectSimilarProductIdsWithLlm(source, candidates, limit);

  if (llmIds && llmIds.length > 0) {
    const byId = new Map(candidates.map((row) => [row.id, row]));
    const llmProducts = llmIds
      .map((id) => byId.get(id))
      .filter((row): row is PublicMarketplaceCardRow => !!row)
      .filter((row) => isCompatibleSimilarCandidate(source, row, "relaxed"))
      .map(transformPublicMarketplaceCard);

    if (llmProducts.length > 0) {
      if (llmProducts.length < limit) {
        const chosenIds = new Set(llmProducts.map((p) => p.id));
        const backfill = scoreSimilarProductsRuleBased(source, candidates, limit)
          .filter((p) => !chosenIds.has(p.id));
        llmProducts.push(...backfill.slice(0, limit - llmProducts.length));
      }
      return { products: llmProducts.slice(0, limit), method: "llm" };
    }
  }

  const ruled = scoreSimilarProductsRuleBased(source, candidates, limit);
  if (ruled.length > 0) {
    return { products: ruled, method: "rules" };
  }

  // Last resort: same category, blocklist only — still better than an empty carousel.
  const fallback = filterCompatibleCandidates(source, raw, "relaxed")
    .slice(0, limit)
    .map(transformPublicMarketplaceCard);

  return { products: fallback, method: "rules" };
}

export async function fetchSimilarProductSource(
  productId: string,
): Promise<SimilarProductSource | null> {
  const supabase = createPublicSupabaseClient();

  const { data: cardRow, error: cardError } = await supabase
    .from("public_marketplace_cards")
    .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
    .eq("id", productId)
    .maybeSingle();

  if (!hasMissingPublicCardFeedError(cardError) && cardRow) {
    const row = cardRow as PublicMarketplaceCardRow;
    return {
      id: row.id,
      display_name: row.display_name,
      description: row.description,
      brand: row.brand,
      price: numberFromDb(row.price) || null,
      marketplace_category: row.marketplace_category,
      marketplace_subcategory: row.marketplace_subcategory,
      marketplace_level_3_category: row.marketplace_level_3_category,
      model_year: row.model_year,
      condition_rating: row.condition_rating ?? null,
      store_account_type: row.store_account_type,
    };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select(`
      id,
      display_name,
      description,
      brand,
      price,
      marketplace_category,
      marketplace_subcategory,
      marketplace_level_3_category,
      model_year,
      condition_rating,
      bike_type,
      frame_size,
      groupset,
      users!user_id ( account_type )
    `)
    .eq("id", productId)
    .maybeSingle();

  if (productError || !product) return null;

  const user = product.users as { account_type?: string | null } | null;

  return {
    id: product.id,
    display_name: product.display_name,
    description: product.description,
    brand: product.brand,
    price: typeof product.price === "number" ? product.price : null,
    marketplace_category: product.marketplace_category,
    marketplace_subcategory: product.marketplace_subcategory,
    marketplace_level_3_category: product.marketplace_level_3_category,
    model_year: product.model_year,
    condition_rating: product.condition_rating,
    bike_type: product.bike_type,
    frame_size: product.frame_size,
    groupset: product.groupset,
    store_account_type: user?.account_type ?? null,
  };
}
