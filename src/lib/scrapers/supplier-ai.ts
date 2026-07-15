import OpenAI from "openai";
import type { SupplierPageSnapshot } from "@/lib/scrapers/supplier-browser";
import type { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import type {
  SupplierBrowseMode,
  SupplierBrowseOption,
  SupplierProductSelectors,
} from "@/lib/scrapers/supplier-types";

const MODEL = "gpt-5.4-mini";

type ResponseOutputItem = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

interface CatalogueAnalysis {
  supplier_name: string;
  catalogue_url: string;
  browse_modes: SupplierBrowseMode[];
  brand_options: Array<{ name: string; url: string; image_url: string | null }>;
  category_options: Array<{ name: string; url: string; image_url: string | null }>;
  product_link_selector: string;
  sample_product_url: string | null;
  next_page_selector: string | null;
}

interface ProductAnalysis {
  name: string;
  price: string | null;
  sku: string | null;
  stock: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  specifications: string | null;
  image: string;
  image_attribute: "src" | "data-src" | "srcset";
  variant_row: string | null;
  variant_name: string | null;
  variant_value: string | null;
  variant_sku: string | null;
  variant_stock: string | null;
  variant_price: string | null;
}

const CATALOGUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "supplier_name",
    "catalogue_url",
    "browse_modes",
    "brand_options",
    "category_options",
    "product_link_selector",
    "sample_product_url",
    "next_page_selector",
  ],
  properties: {
    supplier_name: { type: "string" },
    catalogue_url: { type: "string" },
    browse_modes: {
      type: "array",
      items: { type: "string", enum: ["brand", "category"] },
    },
    brand_options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url", "image_url"],
        properties: {
          name: { type: "string" },
          url: { type: "string" },
          image_url: { type: ["string", "null"] },
        },
      },
    },
    category_options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url", "image_url"],
        properties: {
          name: { type: "string" },
          url: { type: "string" },
          image_url: { type: ["string", "null"] },
        },
      },
    },
    product_link_selector: { type: "string" },
    sample_product_url: { type: ["string", "null"] },
    next_page_selector: { type: ["string", "null"] },
  },
} as const;

const PRODUCT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "price",
    "sku",
    "stock",
    "brand",
    "description",
    "category",
    "specifications",
    "image",
    "image_attribute",
    "variant_row",
    "variant_name",
    "variant_value",
    "variant_sku",
    "variant_stock",
    "variant_price",
  ],
  properties: {
    name: { type: "string" },
    price: { type: ["string", "null"] },
    sku: { type: ["string", "null"] },
    stock: { type: ["string", "null"] },
    brand: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    specifications: { type: ["string", "null"] },
    image: { type: "string" },
    image_attribute: { type: "string", enum: ["src", "data-src", "srcset"] },
    variant_row: { type: ["string", "null"] },
    variant_name: { type: ["string", "null"] },
    variant_value: { type: ["string", "null"] },
    variant_sku: { type: ["string", "null"] },
    variant_stock: { type: ["string", "null"] },
    variant_price: { type: ["string", "null"] },
  },
} as const;

function extractOutputText(output: ResponseOutputItem[] | undefined): string {
  let text = "";
  for (const item of output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) text += content.text;
    }
  }
  return text;
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw.trim()) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("YJ returned an invalid scraper definition.");
    return JSON.parse(match[0]) as T;
  }
}

function openAiClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for YJ to build a scraper.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function compactSnapshot(snapshot: SupplierPageSnapshot): Record<string, unknown> {
  const usefulElements = snapshot.elements
    .filter((element) => {
      if (element.tag === "a" || element.tag === "select" || element.tag === "button") return true;
      if (element.itemprop) return true;
      return /(product|catalog|shop|brand|categor|price|sku|stock|pagination|next)/i.test(
        `${element.selector} ${element.text}`,
      );
    })
    .slice(0, 420);

  return {
    url: snapshot.url,
    title: snapshot.title,
    headings: snapshot.headings,
    body_text: snapshot.bodyText.slice(0, 18_000),
    elements: usefulElements,
    structured_data: snapshot.structuredData.slice(0, 6),
  };
}

function optionId(kind: SupplierBrowseMode, name: string, url: string): string {
  const source = `${kind}-${name}-${url}`.toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${kind}-${(hash >>> 0).toString(36)}`;
}

function normaliseOption(
  kind: SupplierBrowseMode,
  option: { name: string; url: string; image_url: string | null },
  pageUrl: string,
): SupplierBrowseOption | null {
  const name = option.name?.replace(/\s+/g, " ").trim();
  if (!name || !option.url) return null;

  try {
    const url = new URL(option.url, pageUrl).toString();
    const imageUrl = option.image_url
      ? new URL(option.image_url, pageUrl).toString()
      : null;
    return {
      id: optionId(kind, name, url),
      kind,
      name,
      url,
      imageUrl,
    };
  } catch {
    return null;
  }
}

export async function analyseSupplierCatalogue(
  snapshot: SupplierPageSnapshot,
  logger?: SupplierScraperLogger,
): Promise<{
  supplierName: string;
  catalogueUrl: string;
  browseModes: SupplierBrowseMode[];
  brandOptions: SupplierBrowseOption[];
  categoryOptions: SupplierBrowseOption[];
  productLinkSelector: string;
  sampleProductUrl: string | null;
  nextPageSelector: string | null;
}> {
  logger?.step("ai", "Analysing catalogue structure with YJ", {
    url: snapshot.url,
    title: snapshot.title,
  });
  const response = await openAiClient().responses.create({
    model: MODEL,
    instructions: `You are YJ's supplier scraper builder for Australian bicycle stores.

Analyse the supplied authenticated page snapshot and identify the product catalogue structure.
Only use URLs and CSS selectors present in the snapshot. Resolve relative links against the page URL.

Rules:
- A brand option must represent a manufacturer or brand catalogue filter.
- A category option must represent a product category or product family.
- Include both browse modes when both are genuinely available.
- Do not treat account, basket, help, news, login, or policy links as catalogue options.
- product_link_selector must target product detail links, not category links.
- sample_product_url must be one product detail URL when visible.
- next_page_selector is null if there is no clear next-page control.
- Return an empty option array when that browse mode is unavailable.
- Use Australian English.
- Return JSON only.`,
    text: {
      format: {
        type: "json_schema",
        name: "supplier_catalogue_analysis",
        strict: true,
        schema: CATALOGUE_SCHEMA,
      },
    },
    input: JSON.stringify(compactSnapshot(snapshot)),
  });

  const parsed = parseJson<CatalogueAnalysis>(
    extractOutputText(response.output as ResponseOutputItem[] | undefined),
  );
  const brandOptions = parsed.brand_options
    .map((option) => normaliseOption("brand", option, snapshot.url))
    .filter((option): option is SupplierBrowseOption => Boolean(option));
  const categoryOptions = parsed.category_options
    .map((option) => normaliseOption("category", option, snapshot.url))
    .filter((option): option is SupplierBrowseOption => Boolean(option));
  const browseModes = [...new Set(parsed.browse_modes)].filter((mode) => {
    return mode === "brand" ? brandOptions.length > 0 : categoryOptions.length > 0;
  });

  logger?.success("ai", "Catalogue analysis complete", {
    supplierName: parsed.supplier_name.trim() || snapshot.title || "Supplier",
    brandOptions: brandOptions.length,
    categoryOptions: categoryOptions.length,
    browseModes,
    productLinkSelector: parsed.product_link_selector.trim() || 'a[href*="product" i]',
    sampleProductUrl: parsed.sample_product_url,
  });

  return {
    supplierName: parsed.supplier_name.trim() || snapshot.title || "Supplier",
    catalogueUrl: new URL(parsed.catalogue_url || snapshot.url, snapshot.url).toString(),
    browseModes,
    brandOptions,
    categoryOptions,
    productLinkSelector: parsed.product_link_selector.trim() || 'a[href*="product" i]',
    sampleProductUrl: parsed.sample_product_url
      ? new URL(parsed.sample_product_url, snapshot.url).toString()
      : null,
    nextPageSelector: parsed.next_page_selector?.trim() || null,
  };
}

export async function analyseSupplierProduct(
  snapshot: SupplierPageSnapshot,
  logger?: SupplierScraperLogger,
): Promise<SupplierProductSelectors> {
  logger?.step("ai", "Mapping product page fields with YJ", {
    url: snapshot.url,
    title: snapshot.title,
  });
  const response = await openAiClient().responses.create({
    model: MODEL,
    instructions: `You are YJ's supplier product-page mapper.

Choose CSS selectors from the supplied product page snapshot for every available product field.
Only return selectors that appear in the snapshot. Use null when a field is unavailable.

Rules:
- name must identify the product title.
- image must target the product gallery images, not site logos, icons, recommendations, or navigation.
- specifications may target a table, definition list, or specification container.
- variant_row must target one repeated sellable variant row when variants have their own SKU, stock, or price.
- variant child selectors should work relative to each variant row.
- If variants are represented only by one select and there is no per-variant stock or SKU row, leave variant_row null.
- Return JSON only.`,
    text: {
      format: {
        type: "json_schema",
        name: "supplier_product_selectors",
        strict: true,
        schema: PRODUCT_SCHEMA,
      },
    },
    input: JSON.stringify(compactSnapshot(snapshot)),
  });

  const parsed = parseJson<ProductAnalysis>(
    extractOutputText(response.output as ResponseOutputItem[] | undefined),
  );
  const selectors = {
    name: parsed.name.trim() || "h1",
    price: parsed.price?.trim() || null,
    sku: parsed.sku?.trim() || null,
    stock: parsed.stock?.trim() || null,
    brand: parsed.brand?.trim() || null,
    description: parsed.description?.trim() || null,
    category: parsed.category?.trim() || null,
    specifications: parsed.specifications?.trim() || null,
    image: parsed.image.trim() || 'img[itemprop="image"]',
    imageAttribute: parsed.image_attribute,
    variantRow: parsed.variant_row?.trim() || null,
    variantName: parsed.variant_name?.trim() || null,
    variantValue: parsed.variant_value?.trim() || null,
    variantSku: parsed.variant_sku?.trim() || null,
    variantStock: parsed.variant_stock?.trim() || null,
    variantPrice: parsed.variant_price?.trim() || null,
  };
  logger?.success("ai", "Product field mapping complete", {
    name: selectors.name,
    hasVariants: Boolean(selectors.variantRow),
    image: selectors.image,
  });
  return selectors;
}
