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
const MIN_RULE_SCORE = 3;

/** Obvious non-cycling inventory that must never appear as "similar". */
const NON_CYCLING_TITLE =
  /\b(mercedes|bmw|audi|toyota|honda|nissan|ford|holden|mazda|volkswagen|porsche|ferrari|lamborghini|automotive|car part|engine oil|motor oil|brake pad for car|wiper blade|spark plug|transmission fluid|car battery|vehicle|automobile)\b/i;

/**
 * Title patterns used only when category/subcategory does not already imply a kind.
 * More specific product types first. Brand names (Shimano/SRAM) are NOT kinds.
 */
const PRODUCT_KIND_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "helmet", pattern: /\bhelmets?\b/i },
  { kind: "jersey", pattern: /\bjerseys?\b/i },
  { kind: "shorts", pattern: /\bshorts?\b|\bbibs?\b|\bbib[- ]?shorts?\b/i },
  { kind: "jacket", pattern: /\bjackets?\b|\bvests?\b|\bgilets?\b/i },
  { kind: "gloves", pattern: /\bgloves?\b/i },
  { kind: "shoes", pattern: /\bshoes?\b|\bcleats?\b|\bfootwear\b/i },
  { kind: "wheel", pattern: /\bwheelsets?\b|\bwheels?\b|\brims?\b|\btyres?\b|\btires?\b/i },
  { kind: "frame", pattern: /\bframesets?\b|\bframes?\b/i },
  { kind: "drivetrain", pattern: /\bgroupsets?\b|\bgruppo\b|\bcassette\b|\bcrankset\b|\bderailleur\b|\bchainring\b/i },
  { kind: "brakes", pattern: /\bbrakes?\b|\bcaliper\b|\brake lever/i },
  { kind: "handlebars", pattern: /\bhandlebars?\b|\bbar tape\b|\bstem\b/i },
  { kind: "saddle", pattern: /\bsaddles?\b|\bseatpost\b/i },
  { kind: "pedals", pattern: /\bpedals?\b/i },
  { kind: "nutrition", pattern: /\bgel\b|\benergy bar\b|\belectrolyte\b|\bsupplement\b/i },
  // Personal care / workshop consumables (must beat the bike regex).
  { kind: "care", pattern: /\bchamois\b|\bcream\b|\bbalm\b|\bembrocation\b|\bsunscreen\b|\banti[- ]?chafe\b|\bskin\s*care\b|\bsanitisers?\b|\bsanitizers?\b/i },
  { kind: "cleaning", pattern: /\bdegreaser\b|\bcleaner\b|\bbike\s*wash\b|\bshampoo\b|\bpolish\b|\bremover\b/i },
  { kind: "lube", pattern: /\bchain\s*lube\b|\blubricants?\b|\bgrease\b|\blube\b/i },
  // Bike last among cycling products so component words win on parts listings,
  // but category/subcategory mapping already forces "bike" for Bicycles.
  { kind: "bike", pattern: /\bbikes?\b|\bbicycles?\b|\broad bike\b|\bmtb\b|\bmountain bike\b|\begravel\b|\be[- ]?bike\b/i },
];

const CLEARLY_NON_BIKE_TITLE =
  /\b(chamois|cream|balm|helmets?|jerseys?|shorts?|bibs?|gloves?|shoes?|cleats?|gels?|lube|lubricant|grease|degreaser|cleaner|pumps?|locks?|bottles?)\b/i;

const KIND_TITLE_HINTS: Record<string, RegExp> = {
  care: /\b(chamois|cream|balm|embrocation|sunscreen|anti[- ]?chafe|skin\s*care|sanitiser|sanitizer)\b/i,
  cleaning: /\b(degreaser|cleaner|wash|shampoo|polish|cleaning|remover)\b/i,
  lube: /\b(lube|lubricant|grease|oil)\b/i,
  nutrition: /\b(gel|energy bar|electrolyte|supplement|chew|drink mix)\b/i,
};

/** Soft peer groups when exact kind inventory is thin (cream → sanitiser/cleaner). */
const KIND_FAMILIES: Record<string, string[]> = {
  care: ["care", "cleaning", "lube"],
  cleaning: ["cleaning", "lube", "care"],
  lube: ["lube", "cleaning", "care"],
  nutrition: ["nutrition"],
};

function kindFamilyOf(kind: string | null): string[] {
  if (!kind) return [];
  return KIND_FAMILIES[kind] || [kind];
}

function kindsInSameFamily(sourceKind: string | null, candidateKind: string | null): boolean {
  if (!sourceKind || !candidateKind) return false;
  return kindFamilyOf(sourceKind).includes(candidateKind);
}

/** Subcategory → kind (canonical marketplace taxonomy). */
const SUBCATEGORY_KIND: Record<string, string> = {
  // Apparel
  Helmets: "helmet",
  Jerseys: "jersey",
  Shorts: "shorts",
  Jackets: "jacket",
  Gloves: "gloves",
  Shoes: "shoes",
  // Parts
  Frames: "frame",
  Wheels: "wheel",
  Drivetrain: "drivetrain",
  Brakes: "brakes",
  Handlebars: "handlebars",
  Saddles: "saddle",
  Pedals: "pedals",
  // Nutrition
  "Energy Bars": "nutrition",
  Gels: "nutrition",
  Drinks: "nutrition",
  Supplements: "nutrition",
  "Energy Gels & Chews": "nutrition",
  Bars: "nutrition",
  "Drink Mixes & Electrolytes": "nutrition",
  // Workshop / care
  Cleaning: "cleaning",
  "Lubricants & Grease": "lube",
  "Skin Care": "care",
  // Bicycles disciplines all map to bike
  Road: "bike",
  Mountain: "bike",
  Hybrid: "bike",
  Electric: "bike",
  Kids: "bike",
  BMX: "bike",
  Cruiser: "bike",
};

const BICYCLE_SUBCATEGORIES = new Set([
  "Road",
  "Mountain",
  "Hybrid",
  "Electric",
  "Kids",
  "BMX",
  "Cruiser",
  "Other",
]);

function productText(source: Pick<SimilarProductSource, "display_name" | "description">): string {
  return `${source.display_name || ""} ${source.description || ""}`.trim();
}

/** Collapse legacy "Bikes" label into canonical "Bicycles". */
export function normaliseMarketplaceCategory(category: string | null | undefined): string | null {
  if (!category?.trim()) return null;
  const trimmed = category.trim();
  if (/^bikes$/i.test(trimmed)) return "Bicycles";
  return trimmed;
}

/** Values to query so Bikes/Bicycles inventory is treated as one shelf. */
export function categoryQueryValues(category: string | null | undefined): string[] {
  const normalised = normaliseMarketplaceCategory(category);
  if (!normalised) return [];
  if (normalised === "Bicycles") return ["Bicycles", "Bikes"];
  return [normalised];
}

export function categoriesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normaliseMarketplaceCategory(a);
  const right = normaliseMarketplaceCategory(b);
  if (!left || !right) return false;
  return left === right;
}

function rowAsSource(row: PublicMarketplaceCardRow): SimilarProductSource {
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
  };
}

/**
 * Infer shopping-intent kind. Taxonomy wins over title regex so bike listings
 * that mention Shimano/SRAM/tyres are still "bike", not drivetrain/wheel.
 */
export function inferProductKind(source: SimilarProductSource): string | null {
  const category = normaliseMarketplaceCategory(source.marketplace_category);
  const subcategory = source.marketplace_subcategory?.trim() || null;
  const text = productText(source);

  if (category === "Bicycles") return "bike";
  if (category === "Nutrition") return "nutrition";
  if (category === "Maintenance & Workshop") {
    if (subcategory && SUBCATEGORY_KIND[subcategory]) return SUBCATEGORY_KIND[subcategory];
    if (text && CLEARLY_NON_BIKE_TITLE.test(text)) {
      for (const { kind, pattern } of PRODUCT_KIND_PATTERNS) {
        if (kind === "bike") continue;
        if (pattern.test(text)) return kind;
      }
    }
  }

  if (subcategory && SUBCATEGORY_KIND[subcategory]) {
    // Discipline names belong to Bicycles. If a non-bike category somehow has
    // subcategory "Road", ignore that map entry and fall through to title.
    if (BICYCLE_SUBCATEGORIES.has(subcategory) && category && category !== "Bicycles") {
      // fall through
    } else {
      return SUBCATEGORY_KIND[subcategory];
    }
  }

  // bike_type alone must not reclassify creams/apparel as bikes.
  if (source.bike_type?.trim() && !CLEARLY_NON_BIKE_TITLE.test(text)) {
    return "bike";
  }

  if (!text) return null;

  // Complete-bike titles often mention groupsets/tyres. Prefer bike when the
  // title clearly is a bike and is not an explicit component product.
  const looksLikeBike =
    /\b(bikes?|bicycles?|mtb|mountain bike|road bike|gravel bike|e[- ]?bikes?)\b/i.test(text);
  // Tyres/cassettes mentioned on complete bikes should not block bike classification.
  const looksLikeStandaloneComponent =
    /\b(wheelsets?|groupsets?|framesets?|helmets?|jerseys?|bibs?|shorts?|jackets?|gloves?|cleats?|shoes?|chamois|cream|balm|lube|cleaner|degreaser)\b/i.test(
      text,
    );
  if (looksLikeBike && !looksLikeStandaloneComponent) return "bike";

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleMentionsKind(title: string, kind: string): boolean {
  const hint = KIND_TITLE_HINTS[kind];
  if (hint) return hint.test(title);
  return new RegExp(`\\b${escapeRegExp(kind)}s?\\b`, "i").test(title);
}

function isBikeLikeSource(source: SimilarProductSource): boolean {
  if (normaliseMarketplaceCategory(source.marketplace_category) === "Bicycles") return true;
  return inferProductKind(source) === "bike";
}

function isBikeLikeRow(row: PublicMarketplaceCardRow): boolean {
  if (normaliseMarketplaceCategory(row.marketplace_category) === "Bicycles") return true;
  if (row.marketplace_subcategory && BICYCLE_SUBCATEGORIES.has(row.marketplace_subcategory)) {
    // "Other" under Accessories should not count as a bike.
    if (row.marketplace_subcategory === "Other") {
      return normaliseMarketplaceCategory(row.marketplace_category) === "Bicycles";
    }
    return true;
  }
  return inferProductKind(rowAsSource(row)) === "bike";
}

function kindsCompatible(
  sourceKind: string,
  candidateKind: string | null,
  candidateTitle: string,
): boolean {
  if (candidateKind === sourceKind) return true;
  if (!candidateKind) {
    return titleMentionsKind(candidateTitle, sourceKind);
  }
  return false;
}

/**
 * Brand for matching: DB brand first, else a leading brand-like token from the title
 * (e.g. "Muc-Off Women's Chamois Cream" → "Muc-Off").
 */
export function resolveEffectiveBrand(source: SimilarProductSource): string | null {
  const fromField = source.brand?.trim();
  if (fromField) return fromField;

  const title = (source.display_name || "").trim();
  if (!title) return null;

  // Leading token with optional hyphen/apostrophe parts: Muc-Off, Pearl, Giro.
  const leading = title.match(/^([A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*)\b/);
  if (!leading?.[1]) return null;

  const candidate = leading[1].trim();
  if (/^(the|new|used|sale|women'?s|men'?s|kids?|pair|set)$/i.test(candidate)) return null;
  if (candidate.length < 3) return null;
  return candidate;
}

export function brandsMatch(
  sourceBrand: string | null | undefined,
  rowBrand: string | null | undefined,
  rowTitle?: string | null,
): boolean {
  const left = sourceBrand?.trim().toLowerCase();
  if (!left) return false;

  const right = rowBrand?.trim().toLowerCase();
  if (right && (right === left || right.includes(left) || left.includes(right))) return true;

  const title = (rowTitle || "").toLowerCase();
  if (title && title.includes(left)) return true;

  return false;
}

function rowMatchesBrand(source: SimilarProductSource, row: PublicMarketplaceCardRow): boolean {
  const brand = resolveEffectiveBrand(source);
  if (!brand) return false;
  return brandsMatch(brand, row.brand, rowTitle(row));
}

const KEYWORD_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "the",
  "with",
  "from",
  "ml",
  "g",
  "kg",
  "mm",
  "cm",
  "size",
  "new",
  "used",
  "women",
  "womens",
  "woman",
  "men",
  "mens",
  "man",
  "ladies",
  "lady",
  "unisex",
  "pack",
  "set",
]);

/** Title tokens used to find peers when the source has no marketplace category. */
function similarSearchKeywords(
  source: SimilarProductSource,
  sourceKind: string | null,
): string[] {
  const text = productText(source);
  const keywords: string[] = [];

  if (sourceKind && KIND_TITLE_HINTS[sourceKind]) {
    const hint = KIND_TITLE_HINTS[sourceKind];
    const match = text.match(new RegExp(hint.source, "gi"));
    if (match) {
      for (const token of match) {
        const normalised = token.toLowerCase().replace(/\s+/g, " ").trim();
        if (normalised.length >= 3 && !keywords.includes(normalised)) {
          keywords.push(normalised);
        }
      }
    }
  }

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !KEYWORD_STOP_WORDS.has(token) && !/^\d+$/.test(token));

  for (const token of tokens) {
    if (!keywords.includes(token)) keywords.push(token);
    if (keywords.length >= 6) break;
  }

  return keywords.slice(0, 6);
}

/**
 * Hard gate: candidate must belong to the same shopping intent as the source.
 * LLM ranking runs only inside this filtered pool.
 *
 * Modes:
 * - strict: same subcategory or exact kind
 * - family: kind family peers (care↔cleaning) or exact kind
 * - brand: same brand, non-bike (last resort when kind inventory is empty)
 * - relaxed: category peers when categorised; otherwise family/brand rules
 */
export function isCompatibleSimilarCandidate(
  source: SimilarProductSource,
  row: PublicMarketplaceCardRow,
  mode: "strict" | "family" | "brand" | "relaxed" = "strict",
): boolean {
  if (row.id === source.id) return false;

  const candidateTitle = rowTitle(row);
  if (!candidateTitle || isBlockedNonCyclingTitle(candidateTitle)) return false;

  // Never cross the bike ↔ non-bike boundary, even for uncategorised listings.
  const sourceIsBike = isBikeLikeSource(source);
  const candidateIsBike = isBikeLikeRow(row);
  if (sourceIsBike !== candidateIsBike) return false;

  // Same top-level marketplace category is mandatory when the source has one.
  // Bikes/Bicycles are treated as the same shelf.
  if (normaliseMarketplaceCategory(source.marketplace_category)) {
    if (!categoriesMatch(source.marketplace_category, row.marketplace_category)) {
      return false;
    }
  }

  const sourceKind = inferProductKind(source);
  const candidateKind = inferProductKind(rowAsSource(row));

  if (mode === "brand") {
    return rowMatchesBrand(source, row);
  }

  if (mode === "family") {
    if (sourceKind && kindsInSameFamily(sourceKind, candidateKind)) return true;
    if (sourceKind && kindsCompatible(sourceKind, candidateKind, candidateTitle)) return true;
    return false;
  }

  if (mode === "relaxed") {
    if (normaliseMarketplaceCategory(source.marketplace_category)) return true;
    if (sourceKind && kindsInSameFamily(sourceKind, candidateKind)) return true;
    if (sourceKind && kindsCompatible(sourceKind, candidateKind, candidateTitle)) return true;
    // Uncategorised with a brand: allow same-brand non-bike peers.
    if (rowMatchesBrand(source, row)) return true;
    return false;
  }

  const sameSubcategory =
    !!source.marketplace_subcategory &&
    !!row.marketplace_subcategory &&
    row.marketplace_subcategory === source.marketplace_subcategory;

  // Same subcategory (e.g. Apparel › Helmets, Bicycles › Road) is enough.
  if (sameSubcategory) return true;

  if (!sourceKind) {
    // Unknown non-bike source: prefer brand peers, else keep bikes out.
    if (rowMatchesBrand(source, row)) return true;
    return !candidateIsBike;
  }

  return kindsCompatible(sourceKind, candidateKind, candidateTitle);
}

function filterCompatibleCandidates(
  source: SimilarProductSource,
  rows: PublicMarketplaceCardRow[],
  mode: "strict" | "family" | "brand" | "relaxed" = "strict",
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
  const category = normaliseMarketplaceCategory(source.marketplace_category);
  const lines = [
    `Title: ${title}`,
    source.brand || resolveEffectiveBrand(source)
      ? `Brand: ${source.brand || resolveEffectiveBrand(source)}`
      : null,
    category ? `Category: ${category}` : null,
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
  const category = [
    normaliseMarketplaceCategory(row.marketplace_category),
    row.marketplace_subcategory,
  ]
    .filter(Boolean)
    .join(" › ") || "—";
  const price = formatPriceAud(numberFromDb(row.price));
  const condition = row.condition_rating || "—";
  return `${row.id}|${title}|${brand}|${category}|${price}|${condition}`;
}

const SYSTEM_PROMPT = `You pick similar products for Yellow Jersey — an Australian bicycle marketplace ONLY.

Candidates are pre-filtered for compatibility. Rank by shopper similarity.

Rules:
- ONLY return IDs from the candidate list provided
- NEVER pick automotive, car, or non-cycling products
- NEVER pick bikes for creams, cleaners, lubes, apparel, or parts
- Prefer the SAME BRAND when the source has a clear brand (e.g. Muc-Off → other Muc-Off)
- For a helmet, pick other helmets/cycling head protection only
- For apparel, pick same apparel type (helmet↔helmet, jersey↔jersey)
- For parts, pick functionally similar parts (same component type)
- For bikes, pick similar bikes (discipline, price tier, material). Prefer same subcategory (Road↔Road, Mountain↔Mountain)
- For creams/balms/care products, prefer other rider care / cleaning / hygiene products
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

function priceProximityScore(sourcePrice: number, rowPrice: number): number {
  if (sourcePrice <= 0 || rowPrice <= 0) return 0;
  const diff = Math.abs(rowPrice - sourcePrice) / sourcePrice;
  if (diff <= 0.15) return 4;
  if (diff <= 0.25) return 3;
  if (diff <= 0.4) return 2;
  if (diff <= 0.6) return 1;
  return 0;
}

function kindAffinityScore(sourceKind: string | null, row: PublicMarketplaceCardRow): number {
  if (!sourceKind) return 0;
  const candidateKind = inferProductKind(rowAsSource(row));
  if (candidateKind === sourceKind) return 5;
  if (kindsInSameFamily(sourceKind, candidateKind)) return 3;
  if (titleMentionsKind(rowTitle(row), sourceKind)) return 2;
  return 0;
}

/** Rank rows: brand → kind → subcategory → price → recency. */
function sortBySimilarityHints(
  source: SimilarProductSource,
  rows: PublicMarketplaceCardRow[],
): PublicMarketplaceCardRow[] {
  const sourcePrice = source.price ?? 0;
  const sourceKind = inferProductKind(source);

  return [...rows].sort((a, b) => {
    const brandA = rowMatchesBrand(source, a) ? 1 : 0;
    const brandB = rowMatchesBrand(source, b) ? 1 : 0;
    if (brandB !== brandA) return brandB - brandA;

    const kindA = kindAffinityScore(sourceKind, a);
    const kindB = kindAffinityScore(sourceKind, b);
    if (kindB !== kindA) return kindB - kindA;

    const sameSubA =
      !!source.marketplace_subcategory &&
      a.marketplace_subcategory === source.marketplace_subcategory
        ? 1
        : 0;
    const sameSubB =
      !!source.marketplace_subcategory &&
      b.marketplace_subcategory === source.marketplace_subcategory
        ? 1
        : 0;
    if (sameSubB !== sameSubA) return sameSubB - sameSubA;

    const aProx = priceProximityScore(sourcePrice, numberFromDb(a.price));
    const bProx = priceProximityScore(sourcePrice, numberFromDb(b.price));
    if (bProx !== aProx) return bProx - aProx;

    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
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

  const categoryValues = categoryQueryValues(source.marketplace_category);
  const effectiveBrand = resolveEffectiveBrand(source);
  const sourceKind = inferProductKind(source);

  const fetchByCategory = async (subcategory?: string | null) => {
    if (categoryValues.length === 0) return;

    let query = supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .in("marketplace_category", categoryValues)
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

  const fetchByPriceBand = async () => {
    if (categoryValues.length === 0 || !source.price || source.price <= 0) return;

    const low = Math.max(0, source.price * 0.6);
    const high = source.price * 1.4;

    let query = supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .in("marketplace_category", categoryValues)
      .neq("id", source.id)
      .gte("price", low)
      .lte("price", high)
      .order("created_at", { ascending: false })
      .limit(50);

    if (source.marketplace_subcategory) {
      query = query.eq("marketplace_subcategory", source.marketplace_subcategory);
    }

    const { data, error } = await query;
    if (!error) addRows(data as PublicMarketplaceCardRow[]);
  };

  const fetchByBrand = async () => {
    if (!effectiveBrand) return;

    // Brand column match (any category). Critical for uncategorised Muc-Off etc.
    const { data: byBrandCol, error: brandError } = await supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .ilike("brand", effectiveBrand)
      .neq("id", source.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (!brandError) addRows(byBrandCol as PublicMarketplaceCardRow[]);

    // Title contains brand (covers null brand fields on peers).
    const { data: byTitle, error: titleError } = await supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .ilike("display_name", `%${effectiveBrand}%`)
      .neq("id", source.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (!titleError && !hasMissingPublicCardFeedError(titleError)) {
      addRows(byTitle as PublicMarketplaceCardRow[]);
    }
  };

  // Brand first: always pull same-brand inventory into the pool.
  await fetchByBrand();

  if (categoryValues.length > 0) {
    if (source.marketplace_subcategory) {
      await fetchByCategory(source.marketplace_subcategory);
    }
    await fetchByPriceBand();
    if (byId.size < 12) {
      await fetchByCategory();
    }
  } else {
    // Uncategorised: keyword peers for the product type (chamois, cream, …).
    const keywords = similarSearchKeywords(source, sourceKind);

    for (const keyword of keywords) {
      const { data, error } = await supabase
        .from("public_marketplace_cards")
        .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
        .ilike("display_name", `%${keyword}%`)
        .neq("id", source.id)
        .order("created_at", { ascending: false })
        .limit(40);

      if (!error && !hasMissingPublicCardFeedError(error)) {
        addRows(data as PublicMarketplaceCardRow[]);
      }
      if (byId.size >= 40) break;
    }

    if (sourceKind === "bike") {
      for (const category of ["Bicycles", "Bikes"]) {
        const { data, error } = await supabase
          .from("public_marketplace_cards")
          .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
          .eq("marketplace_category", category)
          .neq("id", source.id)
          .order("created_at", { ascending: false })
          .limit(60);

        if (!error) addRows(data as PublicMarketplaceCardRow[]);
      }
    }
    // Do NOT dump random recent inventory for non-bike uncategorised sources.
    // That was how creams ended up next to bicycles.
  }

  return sortBySimilarityHints(source, Array.from(byId.values())).slice(0, MAX_CANDIDATES);
}

function resolveCandidatePool(
  source: SimilarProductSource,
  raw: PublicMarketplaceCardRow[],
): PublicMarketplaceCardRow[] {
  const take = (rows: PublicMarketplaceCardRow[]) =>
    sortBySimilarityHints(source, rows).slice(0, MAX_CANDIDATES);

  const mergeUnique = (...tiers: PublicMarketplaceCardRow[][]) => {
    const seen = new Set<string>();
    const merged: PublicMarketplaceCardRow[] = [];
    for (const tier of tiers) {
      for (const row of tier) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    }
    return merged;
  };

  // When enough same-subcategory peers exist, keep the pool tight (Road↔Road).
  if (source.marketplace_subcategory) {
    const sameSubcategory = raw.filter((row) => {
      if (row.marketplace_subcategory !== source.marketplace_subcategory) return false;
      return isCompatibleSimilarCandidate(source, row, "relaxed");
    });
    if (sameSubcategory.length >= 4) return take(sameSubcategory);
  }

  const strict = filterCompatibleCandidates(source, raw, "strict");
  const family = filterCompatibleCandidates(source, raw, "family");
  const brandPeers = filterCompatibleCandidates(source, raw, "brand");

  // Exact kind first, then family (care↔cleaning), then same-brand non-bike fill.
  // Do not stop at a single strict hit — cream only had one care peer in inventory.
  if (strict.length >= 4) return take(strict);

  const preferred = mergeUnique(strict, family);
  if (preferred.length >= 4) return take(preferred);

  const withBrand = mergeUnique(strict, family, brandPeers);
  if (withBrand.length > 0) return take(withBrand);

  const relaxed = filterCompatibleCandidates(source, raw, "relaxed");
  if (relaxed.length > 0) return take(relaxed);

  return [];
}

function lastResortProducts(
  source: SimilarProductSource,
  raw: PublicMarketplaceCardRow[],
  limit: number,
): MarketplaceProduct[] {
  for (const mode of ["family", "brand", "relaxed"] as const) {
    const rows = filterCompatibleCandidates(source, raw, mode);
    if (rows.length > 0) {
      return sortBySimilarityHints(source, rows)
        .slice(0, limit)
        .map(transformPublicMarketplaceCard);
    }
  }
  return [];
}

export function scoreSimilarProductsRuleBased(
  source: SimilarProductSource,
  candidates: PublicMarketplaceCardRow[],
  limit: number,
): MarketplaceProduct[] {
  const sourceBrand = resolveEffectiveBrand(source)?.toLowerCase() || null;
  const sourcePrice = source.price ?? 0;
  const sourceKind = inferProductKind(source);
  const sourceBikeType = source.bike_type?.trim().toLowerCase() || null;

  return candidates
    .filter((row) => isCompatibleSimilarCandidate(source, row, "relaxed"))
    .map((row) => {
      let score = 0;
      const rowPrice = numberFromDb(row.price);
      const candidate = rowAsSource(row);
      const candidateKind = inferProductKind(candidate);

      if (
        source.marketplace_level_3_category &&
        row.marketplace_level_3_category === source.marketplace_level_3_category
      ) {
        score += 8;
      }
      if (
        source.marketplace_subcategory &&
        row.marketplace_subcategory === source.marketplace_subcategory
      ) {
        score += 7;
      }
      if (categoriesMatch(source.marketplace_category, row.marketplace_category)) {
        score += 4;
      }
      if (sourceKind && candidateKind === sourceKind) {
        score += 8;
      } else if (sourceKind && kindsInSameFamily(sourceKind, candidateKind)) {
        score += 5;
      } else if (sourceKind && titleMentionsKind(rowTitle(row), sourceKind)) {
        score += 3;
      }
      if (
        sourceKind &&
        row.marketplace_subcategory &&
        SUBCATEGORY_KIND[row.marketplace_subcategory] === sourceKind
      ) {
        score += 4;
      }
      if (sourceBrand && rowMatchesBrand(source, row)) {
        score += 8;
      }
      if (source.condition_rating && row.condition_rating === source.condition_rating) {
        score += 2;
      }
      if (source.model_year && row.model_year && source.model_year === row.model_year) {
        score += 2;
      }
      score += priceProximityScore(sourcePrice, rowPrice);

      if (sourceBikeType && row.marketplace_subcategory) {
        const sub = row.marketplace_subcategory.toLowerCase();
        if (sourceBikeType.includes(sub) || sub.includes(sourceBikeType)) {
          score += 3;
        }
      }

      return { row, score };
    })
    .filter(({ score }) => score >= MIN_RULE_SCORE)
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

/**
 * Rule-based similar products with the same last-resort fill as the LLM path.
 * Used by mode=rules and as LLM fallback.
 */
export async function getRuleBasedSimilarProducts(
  source: SimilarProductSource,
  limit: number = DEFAULT_LIMIT,
): Promise<MarketplaceProduct[]> {
  const raw = await fetchCandidateRows(source);
  const candidates = resolveCandidatePool(source, raw);

  if (candidates.length === 0) {
    return lastResortProducts(source, raw, limit);
  }

  const ruled = scoreSimilarProductsRuleBased(source, candidates, limit);
  if (ruled.length > 0) return ruled;

  return lastResortProducts(source, raw, limit);
}

export async function getLlmSimilarProducts(
  source: SimilarProductSource,
  limit: number = DEFAULT_LIMIT,
): Promise<{ products: MarketplaceProduct[]; method: "llm" | "rules" }> {
  const raw = await fetchCandidateRows(source);
  const candidates = resolveCandidatePool(source, raw);

  if (candidates.length === 0) {
    return { products: lastResortProducts(source, raw, limit), method: "rules" };
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
        const backfill = scoreSimilarProductsRuleBased(source, candidates, limit).filter(
          (p) => !chosenIds.has(p.id),
        );
        llmProducts.push(...backfill.slice(0, limit - llmProducts.length));
      }
      return { products: llmProducts.slice(0, limit), method: "llm" };
    }
  }

  const ruled = scoreSimilarProductsRuleBased(source, candidates, limit);
  if (ruled.length > 0) {
    return { products: ruled, method: "rules" };
  }

  return {
    products: lastResortProducts(source, raw, limit),
    method: "rules",
  };
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
    // Prefer products table for bike-specific fields when available.
    const { data: bikeFields } = await supabase
      .from("products")
      .select("bike_type, frame_size, groupset")
      .eq("id", productId)
      .maybeSingle();

    return {
      id: row.id,
      display_name: row.display_name,
      description: row.description,
      brand: row.brand,
      price: numberFromDb(row.price) || null,
      marketplace_category: normaliseMarketplaceCategory(row.marketplace_category),
      marketplace_subcategory: row.marketplace_subcategory,
      marketplace_level_3_category: row.marketplace_level_3_category,
      model_year: row.model_year,
      condition_rating: row.condition_rating ?? null,
      bike_type: bikeFields?.bike_type ?? null,
      frame_size: bikeFields?.frame_size ?? null,
      groupset: bikeFields?.groupset ?? null,
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
    marketplace_category: normaliseMarketplaceCategory(product.marketplace_category),
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
