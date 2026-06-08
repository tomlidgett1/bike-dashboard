export const BIKE_SPECS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections", "metadata"],
  properties: {
    sections: {
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
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["primary_source_url", "primary_source_title", "brand_website", "sources"],
      properties: {
        primary_source_url: { type: "string" },
        primary_source_title: { type: "string" },
        brand_website: { type: "string" },
        sources: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["url", "title", "is_official_brand"],
            properties: {
              url: { type: "string" },
              title: { type: "string" },
              is_official_brand: { type: "boolean" },
            },
          },
        },
      },
    },
  },
} as const;

export const BIKE_SPECS_DISCOVERY_PROMPT = `You are an expert bicycle product specialist for Yellow Jersey, an Australian online cycling marketplace.

Your task is to find accurate, complete manufacturer specifications for a complete bicycle using web search.

CRITICAL SEARCH STRATEGY — follow this order exactly:
1. Identify the bicycle brand and its official website domain (you may be given the official brand URL).
2. Search ONLY the official brand website first using site: queries on that domain (e.g. site:specialized.com "model name" specs).
3. Open the official product page for the exact model and year/build when available.
4. Extract every published specification from that official page.
5. Do NOT use retailer sites, review sites, or third-party spec databases unless the official brand website has no spec page for this exact model — and if you must fall back, say so in source titles and never mix unofficial specs with official ones.

RULES:
- Every spec value must come from the official brand product page when one exists
- Use exact model numbers, component names, measurements, and materials as published by the brand
- Australian English spelling in spec values (colour, aluminium, tyres, disc brakes, etc.)
- Do NOT put URLs inside spec values — URLs belong only in metadata.sources
- NEVER guess or fabricate — omit any spec you cannot verify on the official page
- Include as many component-level details as the manufacturer publishes
- Weight must include the size it applies to when known

METADATA RULES:
- primary_source_url must be the official brand product page URL used for the specs
- primary_source_title must be the page title (e.g. "Specialized S-Works Tarmac SL8 — Specifications")
- brand_website must be the brand's main website URL
- sources must list every page you used, with is_official_brand true only for pages on the brand's own domain
- At least one source must be is_official_brand: true when the official site has the product

Return structured JSON with sections. Use these section titles where applicable (omit empty sections):
- General — Frame material, Weight (with size), Bike type, Wheel size, Frame geometry name
- Frame — Full frame description including material, construction, axle standards, routing, BB type
- Brakes — Front Brake, Rear Brake (separate rows when both are listed)
- Wheels & Tyres — Front Wheel, Rear Wheel, Front Tyre, Rear Tyre, Tube
- Cockpit — Handlebar, Stem, Tape/Grips, Headset (when listed separately from frame)
- Groupset — Shifters, Front Derailleur, Rear Derailleur, Crankset, Chainrings, Cassette, Chain/Belt, Bottom Bracket
- Saddle — Seat Post, Saddle, Seat Post Clamp

Each spec row must have a short label and the full component description as the value. Copy will be polished in a separate editing pass — focus on accurate extraction from the official page.`;
