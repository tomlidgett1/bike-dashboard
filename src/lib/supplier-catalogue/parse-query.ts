import OpenAI from "openai";
import type {
  SupplierAudience,
  SupplierCatalogueSearchFilters,
} from "@/lib/supplier-catalogue/types";

const MODEL = process.env.SUPPLIER_LOOKUP_PARSE_MODEL || "gpt-5.4-mini";
const PARSE_TIMEOUT_MS = 2500;

export interface ParsedSupplierLookupQuery {
  searchText: string;
  filters: SupplierCatalogueSearchFilters;
  summary: string;
  usedLlm: boolean;
}

const AUDIENCE_VALUES: SupplierAudience[] = [
  "kids",
  "mens",
  "womens",
  "unisex",
  "unknown",
];

function heuristicParse(query: string): ParsedSupplierLookupQuery {
  const lower = query.toLowerCase();
  const filters: SupplierCatalogueSearchFilters = { keywords: [] };

  if (/\b(kid|kids|child|children|youth|junior|toddler)\b/i.test(lower)) {
    filters.audience = "kids";
  } else if (/\b(women'?s?|womens|ladies|lady)\b/i.test(lower)) {
    filters.audience = "womens";
  } else if (/\b(men'?s?|mens)\b/i.test(lower)) {
    filters.audience = "mens";
  } else if (/\bunisex\b/i.test(lower)) {
    filters.audience = "unisex";
  }

  const colourMatch = lower.match(
    /\b(black|white|red|blue|green|yellow|orange|pink|purple|grey|gray|navy|silver|gold|teal|brown|beige)\b/,
  );
  if (colourMatch) filters.colour = colourMatch[1];

  if (/\b(in stock|available only|only available)\b/i.test(lower)) {
    filters.inStockOnly = true;
  }

  const productHints = [
    "bottom bracket",
    "winter gloves",
    "gloves",
    "helmet",
    "saddle",
    "tyre",
    "tire",
    "tube",
    "chain",
    "cassette",
    "derailleur",
    "brake pads",
    "pedals",
    "handlebar",
    "jersey",
    "shorts",
    "jacket",
    "shoes",
    "socks",
    "kids bike",
    "bike",
  ];
  for (const hint of productHints) {
    if (lower.includes(hint)) {
      filters.productType = hint;
      break;
    }
  }

  const brandMatch = query.match(
    /\b(?:for|from|by|brand)\s+([A-Z][A-Za-z0-9 &.-]{1,40})/,
  );
  if (brandMatch?.[1]) {
    filters.brand = brandMatch[1].trim();
  } else {
    const knownBrands = [
      "orbea",
      "specialized",
      "trek",
      "giant",
      "cannondale",
      "scott",
      "cervelo",
      "shimano",
      "sram",
      "fox",
      "giro",
      "bell",
      "rapha",
    ];
    for (const brand of knownBrands) {
      if (lower.includes(brand)) {
        filters.brand = brand;
        break;
      }
    }
  }

  const parts = [
    filters.audience && filters.audience !== "unknown" ? filters.audience : null,
    filters.productType,
    filters.colour,
    filters.brand ? `brand ${filters.brand}` : null,
    filters.inStockOnly ? "in stock" : null,
  ].filter(Boolean);

  return {
    searchText: query.trim(),
    filters,
    summary: parts.length > 0 ? `Showing ${parts.join(" + ")}` : `Showing matches for “${query.trim()}”`,
    usedLlm: false,
  };
}

function asAudience(value: unknown): SupplierAudience | null {
  if (typeof value !== "string") return null;
  const normalised = value.toLowerCase().trim() as SupplierAudience;
  return AUDIENCE_VALUES.includes(normalised) ? normalised : null;
}

export async function parseSupplierLookupQuery(
  query: string,
): Promise<ParsedSupplierLookupQuery> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      searchText: "",
      filters: {},
      summary: "Enter what you are looking for",
      usedLlm: false,
    };
  }

  const fallback = heuristicParse(trimmed);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const openai = new OpenAI({ apiKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    const response = await openai.responses.create(
      {
        model: MODEL,
        temperature: 0,
        max_output_tokens: 250,
        text: {
          format: {
            type: "json_schema",
            name: "supplier_lookup_parse",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "searchText",
                "audience",
                "brand",
                "productType",
                "colour",
                "size",
                "inStockOnly",
                "supplier",
                "keywords",
                "summary",
              ],
              properties: {
                searchText: { type: "string" },
                audience: {
                  type: ["string", "null"],
                  enum: [...AUDIENCE_VALUES, null],
                },
                brand: { type: ["string", "null"] },
                productType: { type: ["string", "null"] },
                colour: { type: ["string", "null"] },
                size: { type: ["string", "null"] },
                inStockOnly: { type: "boolean" },
                supplier: { type: ["string", "null"] },
                keywords: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
            },
          },
        },
        input: [
          {
            role: "system",
            content:
              "Parse a bike shop natural-language supplier product request into structured search filters. Prefer Australian spelling (colour). Keep searchText as the best keyword string for full-text search. Use null when unknown. audience must be kids|mens|womens|unisex|unknown|null.",
          },
          {
            role: "user",
            content: trimmed,
          },
        ],
      },
      { signal: controller.signal },
    );

    clearTimeout(timer);

    const text =
      response.output_text?.trim() ||
      response.output
        ?.flatMap((item) =>
          item.type === "message"
            ? item.content
                .filter((part) => part.type === "output_text")
                .map((part) => part.text)
            : [],
        )
        .join("")
        .trim();

    if (!text) return fallback;

    const parsed = JSON.parse(text) as {
      searchText?: string;
      audience?: string | null;
      brand?: string | null;
      productType?: string | null;
      colour?: string | null;
      size?: string | null;
      inStockOnly?: boolean;
      supplier?: string | null;
      keywords?: string[];
      summary?: string;
    };

    return {
      searchText: parsed.searchText?.trim() || trimmed,
      filters: {
        audience: asAudience(parsed.audience) ?? fallback.filters.audience,
        brand: parsed.brand?.trim() || fallback.filters.brand || null,
        productType:
          parsed.productType?.trim() || fallback.filters.productType || null,
        colour: parsed.colour?.trim() || fallback.filters.colour || null,
        size: parsed.size?.trim() || null,
        inStockOnly: Boolean(parsed.inStockOnly) || fallback.filters.inStockOnly,
        supplier: parsed.supplier?.trim() || null,
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords.filter((item) => typeof item === "string")
          : fallback.filters.keywords,
      },
      summary: parsed.summary?.trim() || fallback.summary,
      usedLlm: true,
    };
  } catch {
    return fallback;
  }
}
