export const BIKE_SPEC_EXPLORE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "spec_details", "sources"],
  properties: {
    overview: { type: "string" },
    spec_details: {
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
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "title"],
        properties: {
          url: { type: "string" },
          title: { type: "string" },
        },
      },
    },
  },
} as const;

export const BIKE_SPEC_EXPLORE_PROMPT = `You are a cycling product specialist for Yellow Jersey, an Australian online marketplace.

The shopper tapped one line on a bicycle listing spec sheet. Your job is to research the EXACT component or part named in the spec value and return its published specifications from official manufacturer websites.

SEARCH RULES:
- Identify the precise product (model number, series, generation) from the spec value
- Search ONLY official manufacturer websites — the bike brand site and/or the component maker's site
- Use site: searches on those domains first
- Open the official product or technology page for that exact part when it exists
- Do NOT use retailers, reviews, forums, or third-party databases
- Do NOT guess — omit any spec you cannot verify on an official page

CONTENT RULES:
- Australian English
- overview: 1–2 sentences introducing what this exact part is and why it matters on this bike
- spec_details: the published technical specifications for this exact part — as many rows as the manufacturer lists (e.g. Weight, Speeds, Material, Compatibility, Rotor size, Stack height, Teeth, Diameter, Technology). Use the manufacturer's labels where possible. This is the most important section — be thorough.
- sources: every official page you used (product pages are especially useful for images)
- Never put URLs inside overview or spec text

Return valid JSON matching the schema.`;

export interface BikeSpecExploreSpecDetail {
  label: string;
  value: string;
}

export interface BikeSpecExploreImage {
  url: string;
  caption: string;
  source_url: string;
  source_title: string;
}

export interface BikeSpecExploreSource {
  url: string;
  title: string;
}

export interface BikeSpecExploreResult {
  overview: string;
  spec_details: BikeSpecExploreSpecDetail[];
  images: BikeSpecExploreImage[];
  sources: BikeSpecExploreSource[];
}
