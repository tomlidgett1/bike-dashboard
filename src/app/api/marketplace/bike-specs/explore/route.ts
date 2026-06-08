import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  BIKE_SPEC_EXPLORE_JSON_SCHEMA,
  BIKE_SPEC_EXPLORE_PROMPT,
  type BikeSpecExploreResult,
} from "@/lib/ai/bike-spec-explore-schema";
import { searchBikeSpecImages } from "@/lib/bikes/bike-spec-serper-images";
import {
  getOfficialSearchDomains,
  isOfficialSpecSourceUrl,
} from "@/lib/bikes/official-spec-sources";
import { resolveBrandWebsite } from "@/lib/bikes/brand-websites";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-5.4";

type ExploreRequest = {
  label?: string;
  value?: string;
  sectionTitle?: string;
  productName?: string;
  brand?: string;
  model?: string;
  bikeType?: string;
};

type ResponseOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

function extractOutputText(output: ResponseOutputItem[] | undefined): string {
  let text = "";
  for (const item of output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        text += content.text;
      }
    }
  }
  return text;
}

type ExploreTextResult = Omit<BikeSpecExploreResult, "images">;

function parseExploreResult(raw: unknown): ExploreTextResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as ExploreTextResult;

  const overview = String(data.overview ?? "").trim();
  if (!overview) return null;

  const spec_details = Array.isArray(data.spec_details)
    ? data.spec_details
        .filter((item) => item && item.label && item.value)
        .map((item) => ({
          label: String(item.label).trim(),
          value: String(item.value).trim(),
        }))
        .slice(0, 20)
    : [];

  return {
    overview,
    spec_details,
    sources: Array.isArray(data.sources)
      ? data.sources
          .filter((source) => source && source.url)
          .map((source) => ({
            url: String(source.url).trim(),
            title: String(source.title || source.url).trim(),
          }))
      : [],
  };
}

function extractJson(text: string): ExploreTextResult | null {
  const trimmed = text.trim();
  try {
    return parseExploreResult(JSON.parse(trimmed));
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return parseExploreResult(JSON.parse(match[0]));
    } catch {
      return null;
    }
  }
}

function sanitiseResult(
  result: ExploreTextResult,
  options: { bikeBrand?: string | null; specValue: string }
): ExploreTextResult {
  const sourceOptions = { bikeBrand: options.bikeBrand, specValue: options.specValue };

  const sources = result.sources.filter((source) =>
    isOfficialSpecSourceUrl(source.url, sourceOptions)
  );

  return {
    overview: result.overview,
    spec_details: result.spec_details,
    sources,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExploreRequest;
    const label = body.label?.trim();
    const value = body.value?.trim();

    if (!label || !value) {
      return NextResponse.json(
        { success: false, error: "Spec label and value are required" },
        { status: 400 }
      );
    }

    const brand = body.brand?.trim() || undefined;
    const officialDomains = getOfficialSearchDomains({
      bikeBrand: brand,
      specValue: value,
    });
    const brandWebsite = resolveBrandWebsite(brand);

    const domainSearchBlock =
      officialDomains.length > 0
        ? officialDomains
            .map(
              (domain, index) =>
                `${index + 1}. site:${domain} "${value}" specifications OR site:${domain} "${value}" tech`
            )
            .join("\n")
        : "Identify the official manufacturer website for this component, then search only on that domain.";

    const response = await openai.responses.create({
      model: MODEL,
      instructions: BIKE_SPEC_EXPLORE_PROMPT,
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
          name: "bike_spec_explore",
          strict: true,
          schema: BIKE_SPEC_EXPLORE_JSON_SCHEMA,
        },
      },
      input: `Research the exact part named in this bicycle listing specification.

Product: ${body.productName || "Bicycle listing"}
Brand: ${brand || "Unknown"}
Model: ${body.model || "Unknown"}
Type: ${body.bikeType || "Unknown"}
Section: ${body.sectionTitle || "Specifications"}
Spec label: ${label}
Spec value: ${value}
${brandWebsite ? `Official bike brand website: ${brandWebsite}` : ""}

The shopper wants the published specifications for: ${value}

Required official-domain searches:
${domainSearchBlock}

Return JSON only. spec_details must list the manufacturer's published specs for this exact part.`,
    });

    const parsed = extractJson(
      extractOutputText(response.output as ResponseOutputItem[] | undefined)
    );

    if (!parsed) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not research this specification on official manufacturer sites.",
        },
        { status: 422 }
      );
    }

    const textResult = sanitiseResult(parsed, { bikeBrand: brand, specValue: value });

    if (textResult.sources.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not verify this specification on an official manufacturer website.",
        },
        { status: 422 }
      );
    }

    const images = await searchBikeSpecImages({
      specValue: value,
      bikeBrand: brand,
    });

    const result: BikeSpecExploreResult = {
      ...textResult,
      images,
    };

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Bike spec explore error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to explore specification" },
      { status: 500 }
    );
  }
}
