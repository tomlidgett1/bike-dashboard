import type OpenAI from "openai";
import {
  LISTING_PRICING_DISCOVERY_PROMPT,
  LISTING_PRICING_JSON_SCHEMA,
  type ListingPricingInput,
  type ListingPricingResearch,
} from "./listing-pricing-schema";

// ============================================================
// Web-search pricing research for the sell flow price step.
// ============================================================

const MODEL = "gpt-5.4";

type ResponseOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export interface DiscoverListingPricingResult {
  ok: boolean;
  status: number;
  research?: ListingPricingResearch;
  error?: string;
}

function extractJson(text: string): ListingPricingResearch | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as ListingPricingResearch;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ListingPricingResearch;
    } catch {
      return null;
    }
  }
}

function buildProductContext(input: ListingPricingInput): string {
  const itemLabel =
    input.itemType === "part"
      ? "cycling part / component"
      : input.itemType === "apparel"
        ? "cycling apparel"
        : "bicycle";

  return [
    `Product type: ${itemLabel}`,
    input.title && `Title: ${input.title}`,
    input.brand && `Brand: ${input.brand}`,
    input.model && `Model: ${input.model}`,
    input.year && `Year: ${input.year}`,
    input.bikeType && `Bike type: ${input.bikeType}`,
    input.partType && `Part type: ${input.partType}`,
    input.frameSize && `Frame size: ${input.frameSize}`,
    input.groupset && `Groupset: ${input.groupset}`,
    input.condition && `Seller's condition: ${input.condition}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSearchTerms(input: ListingPricingInput): string {
  return [input.brand, input.model, input.year, input.title, input.bikeType, input.partType]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join(" ");
}

function buildFacebookSearchQuery(input: ListingPricingInput): string {
  const terms = [input.brand, input.model, input.title, input.partType]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join(" ")
    .trim();
  return terms ? `site:facebook.com/marketplace ${terms} Australia` : "";
}

export async function discoverListingPricing(
  openai: OpenAI,
  input: ListingPricingInput,
): Promise<DiscoverListingPricingResult> {
  const searchTerms = buildSearchTerms(input);
  if (!searchTerms.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Add a title, brand, or model so we can research pricing.",
    };
  }

  const details = buildProductContext(input);
  const facebookSearchQuery = buildFacebookSearchQuery(input);

  const response = await openai.responses.create({
    model: MODEL,
    instructions: LISTING_PRICING_DISCOVERY_PROMPT,
    tools: [
      {
        type: "web_search_preview" as const,
        search_context_size: "high" as const,
        user_location: { type: "approximate" as const, country: "AU" },
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "listing_pricing_research",
        strict: true,
        schema: LISTING_PRICING_JSON_SCHEMA,
      },
    },
    input: `Research brand-new retail pricing and comparable listings for this product in Australia.

${details}

Search terms: ${searchTerms}

Facebook Marketplace search (run this explicitly): ${facebookSearchQuery || `"Facebook Marketplace" ${searchTerms} Australia`}

Return valid JSON matching the schema. Include 3–5 comparableListings with real URLs from your web search. Prioritise Facebook Marketplace listings when you find them.`,
  });

  let outputText = "";
  for (const item of response.output ?? []) {
    if (item.type === "message") {
      for (const content of (item as ResponseOutputItem).content ?? []) {
        if (content.type === "output_text" && content.text) outputText += content.text;
      }
    }
  }

  const parsed = extractJson(outputText);
  if (!parsed) {
    return {
      ok: false,
      status: 422,
      error: "Could not parse pricing research. Try again in a moment.",
    };
  }

  const listings = (parsed.comparableListings ?? [])
    .filter((l) => l.title && l.priceAud > 0 && l.sourceName)
    .sort((a, b) => {
      const aFb = a.sourceName.toLowerCase().includes("facebook") ? 0 : 1;
      const bFb = b.sourceName.toLowerCase().includes("facebook") ? 0 : 1;
      return aFb - bFb;
    });

  return {
    ok: true,
    status: 200,
    research: {
      ...parsed,
      comparableListings: listings.slice(0, 5),
      sources: (parsed.sources ?? []).filter((s) => s.title && s.url).slice(0, 8),
    },
  };
}
