import type { SupplierScrapedProduct, SupplierVariant } from "@/lib/scrapers/supplier-types";
import type {
  CanonicalSupplierProductInput,
  SupplierAudience,
  SupplierPriceConfidence,
  SupplierStockStatus,
  SupplierVariantSummary,
} from "@/lib/supplier-catalogue/types";

const KIDS_RE =
  /\b(kid|kids|child|children|youth|junior|jr|toddler|infant|boy'?s?|girl'?s?)\b/i;
const MENS_RE = /\b(men'?s?|mens|male|gentleman)\b/i;
const WOMENS_RE = /\b(women'?s?|womens|ladies|lady|female|girl'?s?)\b/i;
const UNISEX_RE = /\b(unisex|universal)\b/i;

const SIZE_OPTION_RE = /\b(size|sizes|fit|length|frame\s*size)\b/i;
const COLOUR_OPTION_RE = /\b(colou?r|colors?|colourway|finish|shade)\b/i;

const COST_LABEL_RE =
  /\b(cost|wholesale|trade|dealer|buy|net|unit\s*cost|wsale|w\/?sale)\b/i;
const RETAIL_LABEL_RE =
  /\b(rrp|msrp|retail|sell|list|srp|recommended)\b/i;

const UPC_RE = /\b(\d{12,14})\b/;
const EAN_RE = /\b(\d{13})\b/;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function parseMoney(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (!raw) return null;
  const matches = String(raw).replace(/,/g, "").match(/(?:\d+\.\d{1,2}|\d+)/g);
  if (!matches?.length) return null;
  const value = Number(matches[matches.length - 1]);
  return Number.isFinite(value) ? value : null;
}

export function inferAudience(text: string): {
  audience: SupplierAudience;
  audienceRaw: string | null;
} {
  const haystack = text.trim();
  if (!haystack) return { audience: "unknown", audienceRaw: null };

  if (KIDS_RE.test(haystack)) {
    const match = haystack.match(KIDS_RE)?.[0] ?? "kids";
    return { audience: "kids", audienceRaw: match };
  }
  if (UNISEX_RE.test(haystack)) {
    const match = haystack.match(UNISEX_RE)?.[0] ?? "unisex";
    return { audience: "unisex", audienceRaw: match };
  }
  const hasMens = MENS_RE.test(haystack);
  const hasWomens = WOMENS_RE.test(haystack);
  if (hasMens && hasWomens) {
    return { audience: "unisex", audienceRaw: "mens/womens" };
  }
  if (hasWomens) {
    return {
      audience: "womens",
      audienceRaw: haystack.match(WOMENS_RE)?.[0] ?? "womens",
    };
  }
  if (hasMens) {
    return {
      audience: "mens",
      audienceRaw: haystack.match(MENS_RE)?.[0] ?? "mens",
    };
  }
  return { audience: "unknown", audienceRaw: null };
}

export function inferProductType(
  name: string,
  categoryPath: string[],
  description?: string | null,
): string | null {
  const categoryHint = categoryPath.filter(Boolean).slice(-1)[0]?.trim();
  if (categoryHint) return categoryHint;

  const haystack = `${name} ${description ?? ""}`.toLowerCase();
  const known = [
    "bottom bracket",
    "winter glove",
    "glove",
    "helmet",
    "saddle",
    "tyre",
    "tire",
    "tube",
    "chain",
    "cassette",
    "derailleur",
    "brake pad",
    "pedal",
    "handlebar",
    "stem",
    "wheel",
    "jersey",
    "short",
    "jacket",
    "shoe",
    "sock",
    "bike",
    "frame",
  ];
  for (const term of known) {
    if (haystack.includes(term)) return term;
  }
  return null;
}

function classifyStock(
  soh: number | null,
  sohRaw: string | null | undefined,
): { status: SupplierStockStatus; quantity: number | null; raw: string | null } {
  const raw = sohRaw?.trim() || null;
  if (typeof soh === "number" && Number.isFinite(soh)) {
    return {
      status: soh > 0 ? "in_stock" : "out_of_stock",
      quantity: soh,
      raw,
    };
  }
  if (!raw) return { status: "unknown", quantity: null, raw: null };
  if (/\b(out\s*of\s*stock|oos|unavailable|sold\s*out|none)\b/i.test(raw)) {
    return { status: "out_of_stock", quantity: 0, raw };
  }
  if (/\b(in\s*stock|available|yes)\b/i.test(raw)) {
    return { status: "in_stock", quantity: null, raw };
  }
  const numeric = parseMoney(raw);
  if (numeric != null) {
    return {
      status: numeric > 0 ? "in_stock" : "out_of_stock",
      quantity: numeric,
      raw,
    };
  }
  return { status: "unknown", quantity: null, raw };
}

function isSizeOption(optionName: string | null, optionValue: string | null): boolean {
  if (optionName && SIZE_OPTION_RE.test(optionName)) return true;
  if (!optionValue) return false;
  return /^(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,2}(\.\d)?("|cm|mm)?|[2-6]\d)$/i.test(
    optionValue.trim(),
  );
}

function isColourOption(optionName: string | null, optionValue: string | null): boolean {
  if (optionName && COLOUR_OPTION_RE.test(optionName)) return true;
  if (!optionValue) return false;
  return /\b(black|white|red|blue|green|yellow|orange|pink|purple|grey|gray|silver|gold|navy|teal|brown|beige|camo|carbon)\b/i.test(
    optionValue,
  );
}

function aggregateVariants(variants: SupplierVariant[]): {
  sizes: string[];
  colours: string[];
  summary: SupplierVariantSummary[];
  stock: ReturnType<typeof classifyStock>;
  priceFromVariants: number | null;
} {
  const sizes: string[] = [];
  const colours: string[] = [];
  const summary: SupplierVariantSummary[] = [];
  let anyInStock = false;
  let anyKnown = false;
  let totalQty = 0;
  let hasQty = false;
  let priceFromVariants: number | null = null;

  for (const variant of variants) {
    const stock = classifyStock(variant.soh, variant.sohRaw);
    if (stock.status !== "unknown") anyKnown = true;
    if (stock.status === "in_stock") anyInStock = true;
    if (typeof stock.quantity === "number") {
      hasQty = true;
      totalQty += stock.quantity;
    }
    const price = parseMoney(variant.price);
    if (price != null && (priceFromVariants == null || price < priceFromVariants)) {
      priceFromVariants = price;
    }

    if (isSizeOption(variant.optionName, variant.optionValue)) {
      sizes.push(variant.optionValue ?? "");
    } else if (isColourOption(variant.optionName, variant.optionValue)) {
      colours.push(variant.optionValue ?? "");
    } else if (variant.optionValue) {
      // Unknown option: keep as size-like if short, else colour-ish dump into attributes later
      if (variant.optionValue.length <= 8) sizes.push(variant.optionValue);
      else colours.push(variant.optionValue);
    }

    summary.push({
      optionName: variant.optionName,
      optionValue: variant.optionValue,
      sku: variant.sku,
      soh: stock.quantity,
      price,
      stockStatus: stock.status,
    });
  }

  return {
    sizes: uniqueStrings(sizes),
    colours: uniqueStrings(colours),
    summary,
    stock: {
      status: anyKnown
        ? anyInStock
          ? "in_stock"
          : "out_of_stock"
        : "unknown",
      quantity: hasQty ? totalQty : null,
      raw: null,
    },
    priceFromVariants,
  };
}

function extractCode(
  fields: Record<string, string>,
  keys: string[],
  fallback?: string | null,
): string | null {
  for (const key of Object.keys(fields)) {
    if (keys.some((candidate) => key.toLowerCase().includes(candidate))) {
      const value = fields[key]?.trim();
      if (value) return value;
    }
  }
  return fallback?.trim() || null;
}

function inferPrices(
  product: SupplierScrapedProduct,
  variantPrice: number | null,
): {
  costPrice: number | null;
  retailPrice: number | null;
  confidence: SupplierPriceConfidence;
} {
  let costPrice: number | null = null;
  let retailPrice: number | null = null;

  for (const [key, value] of Object.entries(product.fields ?? {})) {
    const amount = parseMoney(value);
    if (amount == null) continue;
    if (COST_LABEL_RE.test(key) && costPrice == null) costPrice = amount;
    if (RETAIL_LABEL_RE.test(key) && retailPrice == null) retailPrice = amount;
  }

  const mainPrice = product.price ?? variantPrice;

  if (costPrice == null && retailPrice == null && mainPrice != null) {
    // B2B portals usually show trade/cost first
    return {
      costPrice: mainPrice,
      retailPrice: null,
      confidence: "inferred",
    };
  }

  if (costPrice == null && mainPrice != null) {
    costPrice = mainPrice;
  }
  if (retailPrice == null && mainPrice != null && costPrice != null && mainPrice > costPrice) {
    retailPrice = mainPrice;
  }

  const confidence: SupplierPriceConfidence =
    costPrice != null || retailPrice != null ? "known" : "unknown";

  return { costPrice, retailPrice, confidence };
}

function extractUpcEan(
  fields: Record<string, string>,
  sku: string | null,
): { upc: string | null; ean: string | null } {
  const upcField = extractCode(fields, ["upc", "barcode", "gtin"], null);
  const eanField = extractCode(fields, ["ean"], null);
  const haystack = `${upcField ?? ""} ${eanField ?? ""} ${sku ?? ""} ${Object.values(fields).join(" ")}`;
  const ean = eanField?.match(EAN_RE)?.[1] ?? haystack.match(EAN_RE)?.[1] ?? null;
  const upc =
    upcField?.match(UPC_RE)?.[1] ??
    haystack.match(UPC_RE)?.[1] ??
    null;
  return { upc, ean };
}

/**
 * Map a scraped supplier product into the canonical shared-catalogue shape.
 * One row per product; sizes/colours aggregated from variants.
 */
export function normaliseScrapedProduct(input: {
  catalogueId: string;
  supplierName: string;
  product: SupplierScrapedProduct;
}): CanonicalSupplierProductInput {
  const { product, catalogueId, supplierName } = input;
  const categoryPath = uniqueStrings(
    [product.categoryUrl, product.fields?.Category, product.fields?.category]
      .map((value) => {
        if (!value) return null;
        try {
          if (value.startsWith("http")) {
            const parts = new URL(value).pathname.split("/").filter(Boolean);
            return parts[parts.length - 1]?.replace(/[_-]+/g, " ") ?? null;
          }
        } catch {
          /* ignore */
        }
        return value;
      }),
  );

  const fromCategoryField = product.fields?.["Category Path"] ?? product.fields?.Breadcrumb;
  if (fromCategoryField) {
    for (const part of fromCategoryField.split(/[>/|]/)) {
      categoryPath.push(part);
    }
  }

  const categories = uniqueStrings(categoryPath);
  const audienceText = [
    product.name,
    product.description,
    product.brand,
    ...categories,
    ...Object.values(product.fields ?? {}),
  ]
    .filter(Boolean)
    .join(" ");
  const { audience, audienceRaw } = inferAudience(audienceText);
  const aggregated = aggregateVariants(product.variants ?? []);
  const stock =
    aggregated.summary.length > 0
      ? aggregated.stock
      : classifyStock(product.soh, product.sohRaw);
  const prices = inferPrices(product, aggregated.priceFromVariants);
  const { upc, ean } = extractUpcEan(product.fields ?? {}, product.sku);
  const productType = inferProductType(
    product.name,
    categories,
    product.description,
  );

  // Pull colours/sizes from free-text fields when variants are empty
  const fieldSizes = extractCode(product.fields ?? {}, ["size", "sizes"], null);
  const fieldColours = extractCode(
    product.fields ?? {},
    ["colour", "color", "colours", "colors"],
    null,
  );
  const sizes = uniqueStrings([
    ...aggregated.sizes,
    ...(fieldSizes ? fieldSizes.split(/[,/;|]/) : []),
  ]);
  const colours = uniqueStrings([
    ...aggregated.colours,
    ...(fieldColours ? fieldColours.split(/[,/;|]/) : []),
  ]);

  return {
    catalogueId,
    supplierName,
    supplierProductId: product.productId,
    supplierSku: product.sku,
    upc,
    ean,
    sourceUrl: product.url,
    name: product.name.trim() || product.sku || product.productId,
    brand: product.brand,
    description: product.description,
    categoryPath: categories,
    productType,
    audience,
    audienceRaw,
    costPrice: prices.costPrice,
    retailPrice: prices.retailPrice,
    currency: "AUD",
    priceConfidence: prices.confidence,
    stockStatus: stock.status,
    stockQuantity: stock.quantity,
    stockRaw: stock.raw ?? product.sohRaw,
    sizes,
    colours,
    variantSummary: aggregated.summary,
    heroImageUrl: product.heroImageUrl,
    imageUrls: product.imageUrls ?? [],
    attributes: {
      fields: product.fields ?? {},
      categoryUrl: product.categoryUrl,
    },
    rawPayload: {
      productId: product.productId,
      url: product.url,
      sku: product.sku,
      price: product.price,
      soh: product.soh,
      sohRaw: product.sohRaw,
      variants: product.variants,
      fields: product.fields,
    },
  };
}

export function toDbRow(input: CanonicalSupplierProductInput) {
  return {
    catalogue_id: input.catalogueId,
    supplier_name: input.supplierName,
    supplier_product_id: input.supplierProductId,
    supplier_sku: input.supplierSku ?? null,
    upc: input.upc ?? null,
    ean: input.ean ?? null,
    source_url: input.sourceUrl,
    name: input.name,
    brand: input.brand ?? null,
    description: input.description ?? null,
    category_path: input.categoryPath ?? [],
    product_type: input.productType ?? null,
    audience: input.audience ?? "unknown",
    audience_raw: input.audienceRaw ?? null,
    cost_price: input.costPrice ?? null,
    retail_price: input.retailPrice ?? null,
    currency: input.currency ?? "AUD",
    price_confidence: input.priceConfidence ?? "unknown",
    stock_status: input.stockStatus ?? "unknown",
    stock_quantity: input.stockQuantity ?? null,
    stock_raw: input.stockRaw ?? null,
    sizes: input.sizes ?? [],
    colours: input.colours ?? [],
    variant_summary: input.variantSummary ?? [],
    hero_image_url: input.heroImageUrl ?? null,
    image_urls: input.imageUrls ?? [],
    attributes: input.attributes ?? {},
    raw_payload: input.rawPayload ?? {},
    scraped_at: new Date().toISOString(),
  };
}
