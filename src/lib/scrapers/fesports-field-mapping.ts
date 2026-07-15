import {
  extractBrandFromUrl,
  formatStockStatusLabel,
  type FEsportsScrapedProduct,
} from "@/lib/scrapers/fesports-scraper";

export interface YellowJerseyProductField {
  key: string;
  label: string;
  required: boolean;
  description?: string;
}

export const YELLOW_JERSEY_PRODUCT_FIELDS: YellowJerseyProductField[] = [
  { key: "display_name", label: "Product name", required: true, description: "Shown in your catalogue" },
  { key: "product_description", label: "Description", required: false, description: "Long product description" },
  { key: "description", label: "Short description", required: false },
  { key: "brand", label: "Brand", required: false },
  { key: "marketplace_category", label: "Product category", required: false },
  { key: "marketplace_subcategory", label: "Product subcategory", required: false },
  { key: "price", label: "Price", required: true, description: "Store selling price (RRP recommended)" },
  { key: "qoh", label: "Stock on hand", required: false },
  { key: "system_sku", label: "SKU", required: false },
  { key: "product_specs", label: "Specifications", required: false },
];

export type FieldMapping = Record<string, string | null>;

export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  display_name: "name",
  product_description: "description",
  description: "name",
  brand: "brand",
  marketplace_category: "category",
  marketplace_subcategory: "subcategory",
  price: "retail_price",
  qoh: "soh",
  system_sku: "sku",
  product_specs: "warranty",
};

function normaliseFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

export function buildScrapedFieldRecord(product: FEsportsScrapedProduct): Record<string, string> {
  const fields: Record<string, string> = {
    product_id: product.productId,
    name: product.name,
    brand: product.brand ?? "",
    sku: product.sku ?? "",
    retail_price: product.price != null ? String(product.price) : "",
    cost_price: product.fields?.["Cost price"] ?? product.fields?.cost_price ?? "",
    soh: product.soh != null ? String(product.soh) : "",
    soh_raw: product.sohRaw ?? "",
    description: product.description ?? "",
    category:
      product.fields?.Category ??
      product.fields?.category ??
      "",
    subcategory:
      product.fields?.Subcategory ??
      product.fields?.subcategory ??
      "",
    product_url: product.url,
    category_url: product.categoryUrl,
    image_count: String(product.imageUrls.length),
    hero_image: product.heroImageUrl ?? product.imageUrls[0] ?? "",
    images: product.imageUrls.join(" | "),
  };

  if (product.variants.length > 0) {
    fields.variants = product.variants
      .map((variant) => {
        const label =
          [variant.optionName, variant.optionValue].filter(Boolean).join(": ") ||
          "Variant";
        const parts = [
          label,
          variant.sku ? `SKU ${variant.sku}` : null,
          formatStockStatusLabel(variant.soh, variant.sohRaw),
          variant.price ? `RRP ${variant.price}` : null,
        ].filter(Boolean);
        return parts.join(" · ");
      })
      .join("\n");
  }

  for (const [key, value] of Object.entries(product.fields ?? {})) {
    if (value == null || value === "") continue;
    fields[normaliseFieldKey(key)] = String(value);
  }

  return fields;
}

export function collectScrapedFieldKeys(products: FEsportsScrapedProduct[]): string[] {
  const keys = new Set<string>();
  for (const product of products) {
    for (const key of Object.keys(buildScrapedFieldRecord(product))) {
      keys.add(key);
    }
  }

  const priority = [
    "name",
    "brand",
    "sku",
    "retail_price",
    "cost_price",
    "soh",
    "description",
    "category",
    "subcategory",
    "warranty",
    "product_url",
    "category_url",
    "image_count",
    "hero_image",
    "images",
    "variants",
  ];

  return [...keys].sort((a, b) => {
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return a.localeCompare(b);
  });
}

function readMappedValue(fields: Record<string, string>, sourceKey: string | null | undefined): string | null {
  if (!sourceKey) return null;
  const value = fields[sourceKey];
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseMappedNumber(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface MappedYellowJerseyProduct {
  productId: string;
  imageUrls: string[];
  heroImageUrl: string | null;
  display_name: string;
  description: string | null;
  product_description: string | null;
  brand: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  price: number;
  qoh: number | null;
  system_sku: string | null;
  product_specs: string | null;
  sourceUrl: string;
}

export function applyFieldMapping(
  product: FEsportsScrapedProduct,
  mapping: FieldMapping,
): MappedYellowJerseyProduct {
  const fields = buildScrapedFieldRecord(product);

  const displayName = readMappedValue(fields, mapping.display_name) ?? product.name;
  const priceValue = parseMappedNumber(readMappedValue(fields, mapping.price));
  const qohValue = parseMappedNumber(readMappedValue(fields, mapping.qoh));

  const mappedBrand = readMappedValue(fields, mapping.brand);
  const resolvedBrand =
    mappedBrand ??
    (product.brand?.trim() || null) ??
    extractBrandFromUrl(product.categoryUrl) ??
    extractBrandFromUrl(product.url);

  return {
    productId: product.productId,
    imageUrls: product.imageUrls,
    heroImageUrl: product.heroImageUrl ?? product.imageUrls[0] ?? null,
    display_name: displayName,
    description: readMappedValue(fields, mapping.description),
    product_description: readMappedValue(fields, mapping.product_description),
    brand: resolvedBrand,
    marketplace_category: readMappedValue(fields, mapping.marketplace_category),
    marketplace_subcategory: readMappedValue(fields, mapping.marketplace_subcategory),
    price: priceValue ?? product.price ?? 0,
    qoh: qohValue != null ? Math.max(0, Math.floor(qohValue)) : product.soh,
    system_sku: readMappedValue(fields, mapping.system_sku) ?? product.sku,
    product_specs: readMappedValue(fields, mapping.product_specs),
    sourceUrl: product.url,
  };
}

export function validateFieldMapping(
  mapping: FieldMapping,
  products: FEsportsScrapedProduct[],
): string[] {
  const errors: string[] = [];

  for (const field of YELLOW_JERSEY_PRODUCT_FIELDS) {
    if (!field.required) continue;
    if (!mapping[field.key]) {
      errors.push(`${field.label} is required. Choose a scraped field to map.`);
    }
  }

  if (products.length > 0) {
    const sample = applyFieldMapping(products[0], mapping);
    if (!sample.display_name.trim()) {
      errors.push("Mapped product name is empty for the first product.");
    }
    if (!(sample.price > 0)) {
      errors.push("Mapped price is missing or zero for the first product.");
    }
  }

  return errors;
}
