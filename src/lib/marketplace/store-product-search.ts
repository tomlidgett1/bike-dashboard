import type { MarketplaceProduct } from "@/lib/types/marketplace";
import type { StoreBrand, StoreCategoryWithProducts } from "@/lib/types/store";

// ── Text normalisation & fuzzy helpers ───────────────────────────────────────

const BIKE_QUERY_TOKENS = new Set([
  "bike",
  "bikes",
  "bicycle",
  "bicycles",
  "cycle",
  "cycles",
]);

const BIKE_CAROUSEL_KEYWORDS = [
  "bike",
  "bicycle",
  "road",
  "mountain",
  "gravel",
  "hybrid",
  "bmx",
  "kids",
  "mtb",
  "cyclocross",
  "cx",
  "e bike",
  "ebike",
  "electric",
];

const BIKE_MARKETPLACE_SUBCATEGORIES = new Set([
  "road",
  "mountain",
  "hybrid",
  "electric",
  "kids",
  "bmx",
  "cruiser",
  "gravel",
  "other",
]);

const MIN_MATCH_SCORE = 12;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses") && token.length > 5) return token.slice(0, -2);
  if (/(ches|shes|xes|zes)$/.test(token) && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("ses") && token.length > 4) return token.slice(0, -1);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

function tokenVariants(token: string): string[] {
  const variants = new Set([token]);
  variants.add(singularToken(token));
  if (token.endsWith("ies") && token.length > 4) variants.add(`${token.slice(0, -3)}y`);
  if (token.endsWith("es") && token.length > 3) variants.add(token.slice(0, -2));
  if (token.endsWith("s") && token.length > 3) variants.add(token.slice(0, -1));
  return Array.from(variants);
}

function queryTokens(query: string): string[] {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens;
  return tokens.filter((t) => t.length > 1);
}

function hasToken(text: string, token: string): boolean {
  return tokenVariants(token).some((v) => text.includes(v));
}

function fuzzyTextScore(query: string, text: unknown): number {
  const q = normalizeText(query);
  const haystack = normalizeText(text);
  if (!q || !haystack) return 0;

  let score = 0;
  if (haystack === q) score += 80;
  if (haystack.includes(q)) score += 40;

  const singularPhrase = queryTokens(query).map(singularToken).join(" ");
  if (singularPhrase && haystack.includes(singularPhrase)) score += 30;

  const tokens = queryTokens(query);
  if (tokens.length > 0 && tokens.every((t) => hasToken(haystack, t))) score += 25;
  for (const token of tokens) {
    if (hasToken(haystack, token)) score += 4;
  }

  return score;
}

function queryHasBikeIntent(query: string): boolean {
  return queryTokens(query).some((token) => BIKE_QUERY_TOKENS.has(token));
}

function isGenericBikeQuery(query: string): boolean {
  const tokens = queryTokens(query);
  return tokens.length > 0 && tokens.every((token) => BIKE_QUERY_TOKENS.has(token));
}

// ── Search context (built once per store) ────────────────────────────────────

export interface StoreProductSearchContext {
  productCarouselNames: Map<string, string[]>;
  productOnBikesPage: Set<string>;
  brandNames: string[];
}

export function buildStoreProductSearchContext(
  categories: StoreCategoryWithProducts[],
  brands: StoreBrand[],
): StoreProductSearchContext {
  const productCarouselNames = new Map<string, string[]>();
  const productOnBikesPage = new Set<string>();

  for (const category of categories) {
    for (const product of category.products) {
      const names = productCarouselNames.get(product.id) ?? [];
      names.push(category.name);
      productCarouselNames.set(product.id, names);
      if (category.store_page === "bikes") {
        productOnBikesPage.add(product.id);
      }
    }
  }

  return {
    productCarouselNames,
    productOnBikesPage,
    brandNames: brands.map((brand) => brand.name).filter(Boolean),
  };
}

function productSearchFields(product: MarketplaceProduct): string[] {
  const legacyCategory = (product as MarketplaceProduct & { category?: string | null }).category;

  return [
    product.display_name,
    product.description,
    product.product_description,
    product.brand,
    product.marketplace_category,
    product.marketplace_subcategory,
    product.marketplace_level_3_category,
    product.category_name,
    legacyCategory,
    product.model_year != null ? String(product.model_year) : null,
    product.bike_type,
    product.frame_size,
    product.frame_material,
    product.groupset,
    product.wheel_size,
    product.part_type_detail,
    product.size,
    product.color_primary,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function carouselNameLooksBikeRelated(name: string): boolean {
  const normalized = normalizeText(name);
  return BIKE_CAROUSEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function lightspeedCategoryLooksBikeRelated(category: string | null | undefined): boolean {
  if (!category) return false;
  const normalized = normalizeText(category);
  return (
    BIKE_QUERY_TOKENS.has(normalized) ||
    normalized.includes("bike") ||
    normalized.includes("bicycle") ||
    normalized.includes("cycle")
  );
}

export function scoreStoreProductSearch(
  product: MarketplaceProduct,
  query: string,
  context: StoreProductSearchContext,
): number {
  const q = normalizeText(query);
  if (!q) return 0;

  const carouselNames = context.productCarouselNames.get(product.id) ?? [];
  const fields = productSearchFields(product);
  const haystack = normalizeText([...fields, ...carouselNames].join(" "));

  let score = fuzzyTextScore(q, haystack);

  for (const field of fields) {
    score = Math.max(score, Math.round(fuzzyTextScore(q, field) * 0.95));
  }

  for (const carouselName of carouselNames) {
    const carouselScore = fuzzyTextScore(q, carouselName);
    if (carouselScore >= 20) {
      score = Math.max(score, carouselScore + 18);
    }
  }

  if (product.brand) {
    const brandScore = fuzzyTextScore(q, product.brand);
    if (brandScore >= 20) {
      score = Math.max(score, brandScore + 22);
    }
  }

  for (const brandName of context.brandNames) {
    const brandQueryScore = fuzzyTextScore(q, brandName);
    if (brandQueryScore >= 20) {
      score = Math.max(score, brandQueryScore + 10);
      if (product.brand && fuzzyTextScore(brandName, product.brand) >= 25) {
        score = Math.max(score, brandQueryScore + 28);
      }
    }
  }

  if (queryHasBikeIntent(q)) {
    if (context.productOnBikesPage.has(product.id)) score += 36;
    if (product.is_bicycle) score += 42;
    if (normalizeText(product.marketplace_category) === "bicycles") score += 32;

    const subcategory = normalizeText(product.marketplace_subcategory);
    if (subcategory && BIKE_MARKETPLACE_SUBCATEGORIES.has(subcategory)) {
      score += 18;
    }

    if (carouselNames.some(carouselNameLooksBikeRelated)) {
      score += 24;
    }

    if (lightspeedCategoryLooksBikeRelated(product.category_name)) {
      score += 20;
    }

    const legacyCategory = (product as MarketplaceProduct & { category?: string | null }).category;
    if (lightspeedCategoryLooksBikeRelated(legacyCategory)) {
      score += 20;
    }

    if (isGenericBikeQuery(q) && score < MIN_MATCH_SCORE) {
      if (
        context.productOnBikesPage.has(product.id) ||
        product.is_bicycle ||
        normalizeText(product.marketplace_category) === "bicycles" ||
        carouselNames.some(carouselNameLooksBikeRelated) ||
        lightspeedCategoryLooksBikeRelated(product.category_name) ||
        lightspeedCategoryLooksBikeRelated(legacyCategory)
      ) {
        score = Math.max(score, MIN_MATCH_SCORE);
      }
    }
  }

  return score;
}

export function matchesStoreProductSearch(
  product: MarketplaceProduct,
  query: string,
  context: StoreProductSearchContext,
): boolean {
  return scoreStoreProductSearch(product, query, context) >= MIN_MATCH_SCORE;
}

export function filterAndRankStoreProductsBySearch(
  products: MarketplaceProduct[],
  query: string,
  context: StoreProductSearchContext,
): MarketplaceProduct[] {
  const trimmed = query.trim();
  if (!trimmed) return [...products];

  const scored = products
    .map((product) => ({
      product,
      score: scoreStoreProductSearch(product, trimmed, context),
    }))
    .filter(({ score }) => score >= MIN_MATCH_SCORE);

  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ product }) => product);
}
