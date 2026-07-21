/** OpenAI strict JSON schemas + prompts for world-class product research. */

import type { WorldClassProductKind } from "./world-class-product-page-types";

const SPEC_SECTIONS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["title", "specs"],
    properties: {
      title: { type: "string" },
      specs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value"],
          properties: {
            label: { type: "string" },
            value: { type: "string" },
          },
        },
      },
    },
  },
} as const;

const TECHNOLOGY_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
    },
  },
} as const;

const KEY_STATS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["label", "value"],
    properties: {
      label: { type: "string" },
      value: { type: "string" },
    },
  },
} as const;

const SOURCES_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["url", "title", "isOfficialBrand"],
    properties: {
      url: { type: "string" },
      title: { type: "string" },
      isOfficialBrand: { type: "boolean" },
    },
  },
} as const;

const HIGHLIGHTS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["title", "description"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
    },
  },
} as const;

const BUYER_FIT_SCHEMA = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["bestFor", "notIdealFor", "ridingStyles", "sizingNotes"],
  properties: {
    bestFor: { type: "array", items: { type: "string" } },
    notIdealFor: { type: "array", items: { type: "string" } },
    /** Bike: riding styles. Non-bike: use cases / disciplines. */
    ridingStyles: { type: "array", items: { type: "string" } },
    sizingNotes: { type: ["string", "null"] },
  },
} as const;

const BRAND_STORY_SCHEMA = {
  type: ["object", "null"],
  additionalProperties: false,
  required: [
    "name",
    "established",
    "origin",
    "tagline",
    "paragraphs",
    "highlights",
  ],
  properties: {
    name: { type: "string" },
    established: { type: ["string", "null"] },
    origin: { type: ["string", "null"] },
    tagline: { type: ["string", "null"] },
    paragraphs: { type: "array", items: { type: "string" } },
    highlights: { type: "array", items: { type: "string" } },
  },
} as const;

const COMPARISONS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["competitor", "summary", "thisBikeWins", "competitorWins"],
    properties: {
      competitor: { type: "string" },
      summary: { type: "string" },
      thisBikeWins: { type: "array", items: { type: "string" } },
      competitorWins: { type: "array", items: { type: "string" } },
    },
  },
} as const;

const EXPERT_INSIGHTS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["title", "body"],
    properties: {
      title: { type: "string" },
      body: { type: "string" },
    },
  },
} as const;

/** Rule block shared by both stages — online sources only, never memory. */
const ONLINE_ONLY_RULES = `ONLINE-ONLY RULES (non-negotiable):
- Every fact you output MUST come from a web page you opened via web search in THIS session.
- Your training memory of this product may be outdated or simply wrong. Treat it as unreliable. Do NOT state specs, weights, prices, materials, compatibility, or history from memory.
- If you cannot verify a fact on a live page right now, OMIT it entirely (empty array / null). An honest gap is correct behaviour; a remembered "fact" is a failure.
- Record every page you actually used in sources. Do not list pages you did not open.
- No URLs inside prose or spec values — URLs belong only in sources.
- Australian English spelling (colour, aluminium, tyre, organised).`;

/* ------------------------------------------------------------------ */
/* Stage 1 — official brand site extraction (bicycles)                 */
/* ------------------------------------------------------------------ */

export const WORLD_CLASS_OFFICIAL_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "productFound",
    "officialProductUrl",
    "productName",
    "brand",
    "model",
    "modelYear",
    "bikeType",
    "keyStats",
    "specifications",
    "technology",
    "sources",
  ],
  properties: {
    productFound: { type: "boolean" },
    officialProductUrl: { type: ["string", "null"] },
    productName: { type: "string" },
    brand: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    modelYear: { type: ["string", "null"] },
    bikeType: { type: ["string", "null"] },
    keyStats: KEY_STATS_SCHEMA,
    specifications: SPEC_SECTIONS_SCHEMA,
    technology: TECHNOLOGY_SCHEMA,
    sources: SOURCES_SCHEMA,
  },
} as const;

export const WORLD_CLASS_OFFICIAL_EXTRACT_PROMPT = `You are a meticulous product-data extractor for Yellow Jersey, an Australian cycling marketplace.

Your ONLY job in this pass: open the manufacturer's OFFICIAL website and extract everything it publishes about one bicycle. The official brand website is the single source of truth for this product.

${ONLINE_ONLY_RULES}

MANDATORY SEARCH PROCEDURE:
1. Run at least 4 site-restricted searches on the official domain you are given (e.g. site:focus-bikes.com "model name" specs / geometry / tech).
2. Open the official product page for the exact model, year and build.
3. Also open the brand's spec tab, geometry table, and any platform/technology pages for this model.
4. If the exact build is not on the primary domain, check the brand's regional variants of the SAME official site (e.g. /en-au/, .com.au, .de) and archived versions of the official page.
5. Do NOT use retailers, review sites, or spec databases in this pass. If the official site truly has no page for this product after step 4, set productFound to false and return empty specifications rather than substituting unofficial data.

EXTRACT:
- officialProductUrl: the exact official product page URL
- productName / brand / model / modelYear / bikeType exactly as the brand presents them
- keyStats: 4-8 headline facts as SHORT figures ("8.8 kg", "Shimano 105 Di2 12-speed", "SRAM Apex", "45 mm tyre clearance"). Include the official RRP as ONE figure if published (prefer AUD from the brand's AU site, label "RRP"). Never sentences, never source names in values.
- specifications: the COMPLETE published spec sheet, grouped (Frame & Fork, Drivetrain, Brakes, Wheels & Tyres, Cockpit, Suspension, E-system, Geometry highlights, General). Copy exact component names, measurements and materials. Omit empty groups.
- technology: every named brand technology/platform/design feature mentioned for this bike, with a plain-English explanation FROM THE OFFICIAL PAGES.
- sources: every official page opened, isOfficialBrand true. If you used an archived official page, still true.`;

/* ------------------------------------------------------------------ */
/* Stage 1 — official brand site extraction (accessories & parts)      */
/* ------------------------------------------------------------------ */

export const WORLD_CLASS_NON_BIKE_OFFICIAL_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "productFound",
    "officialProductUrl",
    "productName",
    "brand",
    "model",
    "modelYear",
    "productCategory",
    "keyStats",
    "specifications",
    "technology",
    "sources",
  ],
  properties: {
    productFound: { type: "boolean" },
    officialProductUrl: { type: ["string", "null"] },
    productName: { type: "string" },
    brand: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    modelYear: { type: ["string", "null"] },
    productCategory: { type: ["string", "null"] },
    keyStats: KEY_STATS_SCHEMA,
    specifications: SPEC_SECTIONS_SCHEMA,
    technology: TECHNOLOGY_SCHEMA,
    sources: SOURCES_SCHEMA,
  },
} as const;

export const WORLD_CLASS_NON_BIKE_OFFICIAL_EXTRACT_PROMPT = `You are a meticulous product-data extractor for Yellow Jersey, an Australian cycling marketplace.

Your ONLY job in this pass: open the manufacturer's OFFICIAL website and extract everything it publishes about one cycling accessory or component (NOT a complete bicycle). The official brand website is the single source of truth for this product.

Examples of in-scope products: helmets, shoes, saddles, pedals, groupsets, wheels, tyres, computers, lights, locks, tools, apparel, bottles, bags, power meters, brakes, stems, bars, seatposts.

${ONLINE_ONLY_RULES}

MANDATORY SEARCH PROCEDURE:
1. Run at least 4 site-restricted searches on the official domain you are given (e.g. site:giro.com "model name" specs / tech / features / size chart).
2. Open the official product page for the exact model (and year/colourway if published).
3. Also open any tech pages, size charts, compatibility charts, manuals, and what's-in-the-box details for this exact product.
4. If the exact SKU is not on the primary domain, check the brand's regional variants of the SAME official site (e.g. /en-au/, .com.au, .eu) and archived versions of the official page.
5. Do NOT use retailers, review sites, or aggregators in this pass. If the official site truly has no page for this product after step 4, set productFound to false and return empty specifications rather than substituting unofficial data.

EXTRACT:
- officialProductUrl: the exact official product page URL
- productName / brand / model / modelYear exactly as the brand presents them
- productCategory: short category label as the brand would (e.g. "Road helmet", "SPD-SL pedals", "GPS bike computer", "Carbon wheelset", "Cycling jersey")
- keyStats: 4-8 headline facts as SHORT figures ("265 g", "MIPS", "IPX7", "12-speed", "28 mm depth", "CE EN 1078"). Include the official RRP as ONE figure if published (prefer AUD from the brand's AU site, label "RRP"). Never sentences, never source names in values.
- specifications: the COMPLETE published spec sheet, grouped as relevant (General, Materials & construction, Dimensions & weight, Compatibility, Sizing, Features, Electronics, What's included, Certifications, Care). Copy exact measurements, materials, standards and compatibility notes. Omit empty groups.
- technology: every named brand technology/platform/safety system/material mentioned for this product, with a plain-English explanation FROM THE OFFICIAL PAGES.
- sources: every official page opened, isOfficialBrand true. If you used an archived official page, still true.`;

/* ------------------------------------------------------------------ */
/* Stage 2 — editorial research (bicycles)                             */
/* ------------------------------------------------------------------ */

export const WORLD_CLASS_EDITORIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "tagline",
    "heroSummary",
    "keyStats",
    "overviewParagraphs",
    "idealRider",
    "highlights",
    "riderFit",
    "brandStory",
    "comparisons",
    "expertInsights",
    "sources",
  ],
  properties: {
    tagline: { type: ["string", "null"] },
    heroSummary: { type: ["string", "null"] },
    keyStats: KEY_STATS_SCHEMA,
    overviewParagraphs: {
      type: "array",
      items: { type: "string" },
    },
    idealRider: { type: ["string", "null"] },
    highlights: HIGHLIGHTS_SCHEMA,
    riderFit: BUYER_FIT_SCHEMA,
    brandStory: BRAND_STORY_SCHEMA,
    comparisons: COMPARISONS_SCHEMA,
    expertInsights: EXPERT_INSIGHTS_SCHEMA,
    sources: SOURCES_SCHEMA,
  },
} as const;

export const WORLD_CLASS_EDITORIAL_PROMPT = `You are the world's best bicycle editorial researcher for Yellow Jersey, an Australian cycling marketplace.

You will be given VERIFIED OFFICIAL DATA already extracted from the manufacturer's website in a previous pass. Treat that data as ground truth — never contradict it. Your job now is the editorial layer: how the bike rides, who it suits, how it compares, and the brand's story.

${ONLINE_ONLY_RULES}

MANDATORY SEARCH PROCEDURE:
1. Run at least 5 web searches for this exact model across reputable cycling media (BikeRadar, Cyclingnews, Escape Collective, Velo, road.cc, Flow Mountain Bike, bicycling.com.au) and open the most relevant reviews and first-ride reports.
2. Search the brand's official about/history pages for the brand story.
3. For comparisons, verify each rival bike's current build via search — name real, current competitor models.
4. If a published Australian price exists (official AU site or a major AU retailer), you may add it to keyStats as ONE figure labelled "RRP" — only if the official data has no price.

WRITE:
- tagline: one sharp editorial line (no marketing fluff)
- heroSummary: 2-3 sentences a knowledgeable bike-shop staff member would say
- keyStats: ONLY add stats missing from the official data (e.g. RRP, measured weight from a credible review clearly labelled). Short figures, never sentences.
- overviewParagraphs: 2-4 rich paragraphs on what the bike is, how it rides (grounded in reviews you opened), and what makes it distinctive
- idealRider: one sentence
- highlights: 5-8 standout features with rider-benefit descriptions, consistent with the official spec sheet
- riderFit: bestFor / notIdealFor / ridingStyles / sizingNotes — practical buying guidance including Australian riding context
- brandStory: heritage, origin, philosophy — 2 paragraphs + short highlights, from pages you opened
- comparisons: 2-4 real rival bikes with honest trade-offs (thisBikeWins = advantages of THIS bike)
- expertInsights: 3-6 deep notes (geometry choices, component quirks, value, upgrade paths, long-term ownership)
- sources: every page you actually opened, isOfficialBrand true only for the brand's own domain

TONE: authoritative, warm, expert bike shop — never brochure copy. No words like amazing, incredible, revolutionary, game-changing.`;

/* ------------------------------------------------------------------ */
/* Stage 2 — editorial research (accessories & parts)                  */
/* ------------------------------------------------------------------ */

export const WORLD_CLASS_NON_BIKE_EDITORIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "tagline",
    "heroSummary",
    "keyStats",
    "overviewParagraphs",
    "idealRider",
    "highlights",
    "riderFit",
    "brandStory",
    "comparisons",
    "expertInsights",
    "sources",
  ],
  properties: {
    tagline: { type: ["string", "null"] },
    heroSummary: { type: ["string", "null"] },
    keyStats: KEY_STATS_SCHEMA,
    overviewParagraphs: {
      type: "array",
      items: { type: "string" },
    },
    idealRider: { type: ["string", "null"] },
    highlights: HIGHLIGHTS_SCHEMA,
    riderFit: BUYER_FIT_SCHEMA,
    brandStory: BRAND_STORY_SCHEMA,
    comparisons: COMPARISONS_SCHEMA,
    expertInsights: EXPERT_INSIGHTS_SCHEMA,
    sources: SOURCES_SCHEMA,
  },
} as const;

export const WORLD_CLASS_NON_BIKE_EDITORIAL_PROMPT = `You are the world's best cycling product editorial researcher for Yellow Jersey, an Australian cycling marketplace.

You will be given VERIFIED OFFICIAL DATA already extracted from the manufacturer's website in a previous pass for a cycling ACCESSORY or COMPONENT (not a complete bicycle). Treat that data as ground truth — never contradict it. Your job now is the editorial layer: what it is for, who should buy it, compatibility, how it compares, and the brand's story.

${ONLINE_ONLY_RULES}

MANDATORY SEARCH PROCEDURE:
1. Run at least 5 web searches for this exact model across reputable cycling media (BikeRadar, Cyclingnews, Escape Collective, Velo, road.cc, DC Rainmaker for computers/power, Flow Mountain Bike, bicycling.com.au) and open the most relevant reviews, lab tests and long-term reports.
2. Search the brand's official about/history pages for the brand story.
3. For comparisons, verify each rival product via search — name real, current competitor models in the same category.
4. Explicitly look for compatibility notes (bike standards, groupset generations, shoe cleat systems, helmet certifications, computer mount standards, tyre sizes, etc.).
5. If a published Australian price exists (official AU site or a major AU retailer), you may add it to keyStats as ONE figure labelled "RRP" — only if the official data has no price.

WRITE:
- tagline: one sharp editorial line (no marketing fluff)
- heroSummary: 2-3 sentences a knowledgeable bike-shop staff member would say when recommending this product
- keyStats: ONLY add stats missing from the official data (e.g. RRP, independently measured weight). Short figures, never sentences.
- overviewParagraphs: 2-4 rich paragraphs on what the product is, how it performs in real use (grounded in reviews you opened), and what makes it distinctive
- idealRider: one sentence describing the ideal buyer or use case (field name is historical — write for the buyer, not necessarily a "rider")
- highlights: 5-8 standout features with practical buyer-benefit descriptions, consistent with the official spec sheet
- riderFit: bestFor / notIdealFor / ridingStyles (use cases or disciplines) / sizingNotes (include sizing AND key compatibility notes) — practical buying guidance including Australian context
- brandStory: heritage, origin, philosophy — 2 paragraphs + short highlights, from pages you opened
- comparisons: 2-4 real rival products in the same category with honest trade-offs (thisBikeWins = advantages of THIS product; keep the field name)
- expertInsights: 3-6 deep notes (compatibility gotchas, install tips, durability, value, upgrade paths, care)
- sources: every page you actually opened, isOfficialBrand true only for the brand's own domain

TONE: authoritative, warm, expert bike shop — never brochure copy. No words like amazing, incredible, revolutionary, game-changing.`;

/* ------------------------------------------------------------------ */
/* Kind-aware selectors                                                */
/* ------------------------------------------------------------------ */

export function officialExtractPromptForKind(
  kind: WorldClassProductKind,
): string {
  return kind === "non_bike"
    ? WORLD_CLASS_NON_BIKE_OFFICIAL_EXTRACT_PROMPT
    : WORLD_CLASS_OFFICIAL_EXTRACT_PROMPT;
}

export function officialExtractSchemaForKind(kind: WorldClassProductKind) {
  return kind === "non_bike"
    ? WORLD_CLASS_NON_BIKE_OFFICIAL_EXTRACT_SCHEMA
    : WORLD_CLASS_OFFICIAL_EXTRACT_SCHEMA;
}

export function editorialPromptForKind(kind: WorldClassProductKind): string {
  return kind === "non_bike"
    ? WORLD_CLASS_NON_BIKE_EDITORIAL_PROMPT
    : WORLD_CLASS_EDITORIAL_PROMPT;
}

export function editorialSchemaForKind(kind: WorldClassProductKind) {
  return kind === "non_bike"
    ? WORLD_CLASS_NON_BIKE_EDITORIAL_SCHEMA
    : WORLD_CLASS_EDITORIAL_SCHEMA;
}
