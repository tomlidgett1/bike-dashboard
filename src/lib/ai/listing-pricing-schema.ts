// ============================================================
// Listing pricing research — JSON schema + types for web-search
// brand-new RRP and comparable marketplace listings.
// ============================================================

export type PricingConfidence = "high" | "medium" | "low";

export interface ListingPricingComparable {
  title: string;
  priceAud: number;
  condition: string;
  sourceName: string;
  url: string;
}

export interface ListingPricingResearch {
  brandNew: {
    priceAud: number;
    priceLabel: string;
    retailerName: string;
    confidence: PricingConfidence;
    notes: string;
  };
  usedMarket: {
    lowAud: number;
    suggestedAud: number;
    highAud: number;
    note: string;
  };
  comparableListings: ListingPricingComparable[];
  summary: string;
  sources: Array<{ title: string; url: string }>;
}

export interface ListingPricingInput {
  title?: string;
  brand?: string;
  model?: string;
  year?: string;
  condition?: string;
  itemType?: string;
  bikeType?: string;
  frameSize?: string;
  groupset?: string;
  partType?: string;
}

export const LISTING_PRICING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brandNew", "usedMarket", "comparableListings", "summary", "sources"],
  properties: {
    brandNew: {
      type: "object",
      additionalProperties: false,
      required: ["priceAud", "priceLabel", "retailerName", "confidence", "notes"],
      properties: {
        priceAud: { type: "number" },
        priceLabel: { type: "string" },
        retailerName: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        notes: { type: "string" },
      },
    },
    usedMarket: {
      type: "object",
      additionalProperties: false,
      required: ["lowAud", "suggestedAud", "highAud", "note"],
      properties: {
        lowAud: { type: "number" },
        suggestedAud: { type: "number" },
        highAud: { type: "number" },
        note: { type: "string" },
      },
    },
    comparableListings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "priceAud", "condition", "sourceName", "url"],
        properties: {
          title: { type: "string" },
          priceAud: { type: "number" },
          condition: { type: "string" },
          sourceName: { type: "string" },
          url: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url"],
        properties: {
          title: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
} as const;

export const LISTING_PRICING_DISCOVERY_PROMPT = `You are a cycling marketplace pricing analyst for Yellow Jersey, an Australian second-hand cycling marketplace.

Your task is to research what a product sells for BRAND NEW in Australia, and find a few real comparable listings (new or used) on the public web.

SEARCH STRATEGY:
1. Search for the official brand-new RRP / retail price in AUD from Australian retailers (99 Bikes, Bicycle Superstore, Reid, manufacturer AU site, major bike shops) or the manufacturer's official pricing.
2. **Facebook Marketplace (required):** Run at least one dedicated search for Facebook Marketplace listings in Australia, e.g. "site:facebook.com/marketplace [brand] [model]" or "Facebook Marketplace [product] Australia". Include every real Facebook Marketplace listing you find in comparableListings with sourceName exactly "Facebook Marketplace" and the full listing URL.
3. Search for additional comparable listings on other marketplaces and retailers (eBay Australia, Gumtree, Reverb, BikeExchange, retailer sale pages). Prefer listings that closely match brand, model, and year.
4. Estimate a fair used price range for the seller's stated condition, based on brand-new price, Facebook Marketplace comps, and other comparable used listings.

RULES:
- All prices must be in AUD. Convert if the source is USD/NZD and note the conversion briefly in notes.
- brandNew.priceAud must be the typical brand-new retail for this exact or closest matching product. Use 0 only if you truly cannot find a credible new price after searching.
- comparableListings: return 3–5 entries with real titles, prices, condition, source name, and URLs you found via search. **Include at least 1–2 from Facebook Marketplace when any exist** — do not skip Facebook in favour of only retailer pages.
- usedMarket: suggest low / sweet-spot / high AUD prices for a private seller listing, adjusted for the stated condition and Facebook Marketplace / peer-to-peer comps where available.
- Be honest about confidence — use "low" when the match is approximate.
- Australian English in all text fields.
- Do NOT invent URLs or prices. Only include listings and sources you actually found.
- sources: include every page you referenced (manufacturer, retailer, marketplace).`;
