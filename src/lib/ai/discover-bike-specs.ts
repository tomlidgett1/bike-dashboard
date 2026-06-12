import type OpenAI from "openai";
import {
  BIKE_SPECS_DISCOVERY_PROMPT,
  BIKE_SPECS_JSON_SCHEMA,
} from "./bike-specs-schema";
import { cleanBikeSpecsWithAI } from "./bike-specs-clean";
import {
  brandWebsiteDomain,
  isOfficialBrandUrl,
  resolveBrandWebsite,
} from "@/lib/bikes/brand-websites";
import {
  parseBikeSpecs,
  type BikeSpecSource,
  type BikeSpecsData,
  type BikeSpecsMetadata,
} from "@/lib/types/bike-specs";

// ============================================================
// Shared bike-spec discovery core.
// Used by the store-side discover route (saved product) and the
// seller-side pre-publish preview route (no product row yet).
// ============================================================

const MODEL = "gpt-5.4";

type ResponseOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{ type?: string; url?: string; title?: string }>;
  }>;
};

export interface DiscoverSpecInput {
  productName: string;
  brand?: string | null;
  model?: string | null;
  modelYear?: string | null;
  bikeType?: string | null;
  frameSize?: string | null;
  frameMaterial?: string | null;
  groupset?: string | null;
  wheelSize?: string | null;
  productDescription?: string | null;
}

export interface DiscoverSpecResult {
  ok: boolean;
  status: number;
  bikeSpecs?: BikeSpecsData;
  error?: string;
}

function extractJson(text: string): BikeSpecsData | null {
  const trimmed = text.trim();
  try {
    return parseBikeSpecs(JSON.parse(trimmed));
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return parseBikeSpecs(JSON.parse(match[0]));
    } catch {
      return null;
    }
  }
}

function extractCitations(output: ResponseOutputItem[] | undefined): BikeSpecSource[] {
  const seen = new Set<string>();
  const citations: BikeSpecSource[] = [];
  for (const item of output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;
      for (const ann of content.annotations ?? []) {
        if (ann.type !== "url_citation" || !ann.url || seen.has(ann.url)) continue;
        seen.add(ann.url);
        citations.push({ url: ann.url, title: ann.title || ann.url, is_official_brand: false });
      }
    }
  }
  return citations;
}

function mergeMetadata(
  parsed: BikeSpecsData,
  citationSources: BikeSpecSource[],
  brand: string | undefined,
  brandWebsite: string | null,
): BikeSpecsMetadata | null {
  const merged = new Map<string, BikeSpecSource>();
  for (const source of parsed.metadata?.sources ?? []) {
    merged.set(source.url, {
      ...source,
      is_official_brand: source.is_official_brand || isOfficialBrandUrl(source.url, brand),
    });
  }
  for (const source of citationSources) {
    if (merged.has(source.url)) continue;
    merged.set(source.url, {
      ...source,
      is_official_brand: isOfficialBrandUrl(source.url, brand),
    });
  }
  const sources = Array.from(merged.values());
  if (sources.length === 0) return parsed.metadata ?? null;
  const officialSources = sources.filter((s) => s.is_official_brand);
  const primaryFromModel = parsed.metadata?.primary_source_url
    ? sources.find((s) => s.url === parsed.metadata?.primary_source_url)
    : null;
  const primary =
    (primaryFromModel?.is_official_brand ? primaryFromModel : null) ??
    officialSources[0] ??
    primaryFromModel ??
    sources[0];
  return {
    primary_source_url: primary.url,
    primary_source_title:
      parsed.metadata?.primary_source_title || primary.title || "Official product page",
    brand_website: brandWebsite ?? parsed.metadata?.brand_website ?? null,
    discovered_at: new Date().toISOString(),
    sources,
  };
}

export async function discoverBikeSpecs(
  openai: OpenAI,
  input: DiscoverSpecInput,
): Promise<DiscoverSpecResult> {
  const productName = input.productName || "Unknown bicycle";
  const brand = input.brand || undefined;
  const brandWebsite = resolveBrandWebsite(brand);
  const brandDomain = brandWebsite ? brandWebsiteDomain(brandWebsite) : null;

  const details = [
    `Product: ${productName}`,
    brand && `Brand: ${brand}`,
    input.model && `Model: ${input.model}`,
    input.modelYear && `Year: ${input.modelYear}`,
    input.bikeType && `Type: ${input.bikeType}`,
    input.frameSize && `Size: ${input.frameSize}`,
    input.frameMaterial && `Frame material: ${input.frameMaterial}`,
    input.groupset && `Groupset: ${input.groupset}`,
    input.wheelSize && `Wheel size: ${input.wheelSize}`,
    input.productDescription && `Existing description: ${input.productDescription.slice(0, 500)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const searchTerms = [brand, input.model, input.modelYear, productName].filter(Boolean).join(" ");

  const officialSearchBlock = brandDomain
    ? `
OFFICIAL BRAND WEBSITE (search this first):
- Brand website: ${brandWebsite}
- Domain: ${brandDomain}
- Required first searches:
  1. site:${brandDomain} ${searchTerms} specifications
  2. site:${brandDomain} ${searchTerms} tech specs
  3. site:${brandDomain} "${input.model || productName}" ${input.modelYear || ""}`.trim()
    : `
OFFICIAL BRAND WEBSITE:
- Brand was not recognised automatically. Identify the manufacturer's official website domain first, then run site: searches on that domain before using any other source.`.trim();

  const response = await openai.responses.create({
    model: MODEL,
    instructions: BIKE_SPECS_DISCOVERY_PROMPT,
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
        name: "bike_specs",
        strict: true,
        schema: BIKE_SPECS_JSON_SCHEMA,
      },
    },
    input: `Find the complete manufacturer specification sheet for this bicycle from the official brand website.

${details}

${officialSearchBlock}

Only include specifications verified on the official brand product page. Return valid JSON matching the schema, including metadata.sources for every page used.`,
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
  if (!parsed || parsed.sections.length === 0) {
    return {
      ok: false,
      status: 422,
      error:
        "Could not find verified specifications on the official brand website. Check the brand and model are correct.",
    };
  }

  const citationSources = extractCitations(response.output as ResponseOutputItem[] | undefined);
  const metadata = mergeMetadata(parsed, citationSources, brand, brandWebsite);

  if (!metadata?.sources.some((s) => s.is_official_brand)) {
    return {
      ok: false,
      status: 422,
      error: brand
        ? `Could not verify specifications on the official ${brand} website. Try refining the brand or model.`
        : "Could not find an official brand website for this product. Add the correct brand first.",
    };
  }

  const polishedSections = await cleanBikeSpecsWithAI(openai, parsed.sections, { productName });

  return {
    ok: true,
    status: 200,
    bikeSpecs: { sections: polishedSections, metadata },
  };
}
