import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  BIKE_SPECS_DISCOVERY_PROMPT,
  BIKE_SPECS_JSON_SCHEMA,
} from "@/lib/ai/bike-specs-schema";
import { cleanBikeSpecsWithAI } from "@/lib/ai/bike-specs-clean";
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

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";

type ResponseOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{
      type?: string;
      url?: string;
      title?: string;
    }>;
  }>;
};

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
        citations.push({
          url: ann.url,
          title: ann.title || ann.url,
          is_official_brand: false,
        });
      }
    }
  }

  return citations;
}

function mergeMetadata(
  parsed: BikeSpecsData,
  citationSources: BikeSpecSource[],
  brand: string | undefined,
  brandWebsite: string | null
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

  const officialSources = sources.filter((source) => source.is_official_brand);
  const primaryFromModel = parsed.metadata?.primary_source_url
    ? sources.find((source) => source.url === parsed.metadata?.primary_source_url)
    : null;

  const primary =
    (primaryFromModel?.is_official_brand ? primaryFromModel : null) ??
    officialSources[0] ??
    primaryFromModel ??
    sources[0];

  return {
    primary_source_url: primary.url,
    primary_source_title:
      parsed.metadata?.primary_source_title ||
      primary.title ||
      "Official product page",
    brand_website: brandWebsite ?? parsed.metadata?.brand_website ?? null,
    discovered_at: new Date().toISOString(),
    sources,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const { productId } = body as { productId?: string };

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const { data: product, error: fetchError } = await supabase
      .from("products")
      .select(
        "id, user_id, description, display_name, brand, model, model_year, manufacturer_name, marketplace_category, bike_type, frame_size, frame_material, groupset, wheel_size, product_description"
      )
      .eq("id", productId)
      .single();

    if (fetchError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (product.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 403 });
    }

    const productName =
      product.display_name || product.description || "Unknown bicycle";
    const brand = product.brand || product.manufacturer_name || undefined;
    const brandWebsite = resolveBrandWebsite(brand);
    const brandDomain = brandWebsite ? brandWebsiteDomain(brandWebsite) : null;

    const details = [
      `Product: ${productName}`,
      brand && `Brand: ${brand}`,
      product.model && `Model: ${product.model}`,
      product.model_year && `Year: ${product.model_year}`,
      product.bike_type && `Type: ${product.bike_type}`,
      product.frame_size && `Size: ${product.frame_size}`,
      product.frame_material && `Frame material: ${product.frame_material}`,
      product.groupset && `Groupset: ${product.groupset}`,
      product.wheel_size && `Wheel size: ${product.wheel_size}`,
      product.product_description &&
        `Existing description: ${product.product_description.slice(0, 500)}`,
      product.description &&
        product.description !== productName &&
        `Original listing name: ${product.description}`,
    ]
      .filter(Boolean)
      .join("\n");

    const searchTerms = [brand, product.model, product.model_year, productName]
      .filter(Boolean)
      .join(" ");

    const officialSearchBlock = brandDomain
      ? `
OFFICIAL BRAND WEBSITE (search this first):
- Brand website: ${brandWebsite}
- Domain: ${brandDomain}
- Required first searches:
  1. site:${brandDomain} ${searchTerms} specifications
  2. site:${brandDomain} ${searchTerms} tech specs
  3. site:${brandDomain} "${product.model || productName}" ${product.model_year || ""}`.trim()
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
          if (content.type === "output_text" && content.text) {
            outputText += content.text;
          }
        }
      }
    }

    const parsed = extractJson(outputText);
    if (!parsed || parsed.sections.length === 0) {
      return NextResponse.json(
        {
          error:
            "Could not find verified specifications on the official brand website. Check the product name and brand are correct.",
        },
        { status: 422 }
      );
    }

    const citationSources = extractCitations(
      response.output as ResponseOutputItem[] | undefined
    );
    const metadata = mergeMetadata(parsed, citationSources, brand, brandWebsite);

    if (!metadata?.sources.some((source) => source.is_official_brand)) {
      return NextResponse.json(
        {
          error: brand
            ? `Could not verify specifications on the official ${brand} website. Try updating the brand or model name, then run AI Add again.`
            : "Could not find an official brand website for this product. Add the correct brand first, then run AI Add again.",
        },
        { status: 422 }
      );
    }

    const polishedSections = await cleanBikeSpecsWithAI(openai, parsed.sections, {
      productName,
    });

    const bikeSpecs: BikeSpecsData = {
      sections: polishedSections,
      metadata,
    };

    const { data: updated, error: updateError } = await supabase
      .from("products")
      .update({
        bike_specs: bikeSpecs,
        is_bicycle: true,
        marketplace_category: product.marketplace_category || "Bicycles",
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .select("id, is_bicycle, bike_specs")
      .single();

    if (updateError) {
      console.error("Failed to save bike specs:", updateError);
      return NextResponse.json({ error: "Failed to save specifications" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      bike_specs: updated.bike_specs,
      is_bicycle: updated.is_bicycle,
    });
  } catch (error) {
    console.error("Bike specs discovery error:", error);
    return NextResponse.json(
      { error: "Failed to discover bicycle specifications" },
      { status: 500 }
    );
  }
}
