import OpenAI from "openai";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";

export type ListingFieldConfidence = "high" | "medium" | "low";

export interface ListingAiFieldSuggestion {
  value: string;
  confidence: ListingFieldConfidence;
  alternatives?: string[];
}

export type ListingAiFieldsMap = Record<string, ListingAiFieldSuggestion>;

const SUGGESTIONS_MODEL = "gpt-5.4-nano";

const BIKE_FIELDS = [
  "title",
  "bikeType",
  "brand",
  "model",
  "year",
  "frameSize",
  "frameMaterial",
  "colourPrimary",
  "wheelSize",
  "groupset",
  "suspension",
  "weight",
  "condition",
] as const;

const PART_FIELDS = [
  "title",
  "partType",
  "brand",
  "model",
  "colourPrimary",
  "condition",
] as const;

const APPAREL_FIELDS = [
  "title",
  "brand",
  "size",
  "colourPrimary",
  "condition",
] as const;

const SYSTEM_PROMPT = `You help sellers list items on Yellow Jersey, an Australian bike marketplace.

Given a photo-analysis JSON payload, return field suggestions the seller can tap to fill their listing.

Return JSON only:
{
  "fields": {
    "<fieldKey>": {
      "value": "best guess",
      "confidence": "high" | "medium" | "low",
      "alternatives": ["other plausible option", "..."]
    }
  }
}

Rules:
- Australian English spelling
- Only include keys from the requested field list
- "value" is your best single answer; put other plausible values in "alternatives" (never duplicate "value" in alternatives)
- confidence: high = clearly visible or well supported; medium = likely but worth checking; low = guess
- title: provide exactly 3 alternatives (4 title options total including value). Marketplace titles: brand, model, year, key spec — concise, no emoji
- brand, model, year, frameSize, groupset, bikeType: 1–2 alternatives when genuinely plausible
- colourPrimary, wheelSize, frameMaterial, condition: alternatives only when uncertain
- partType / size (apparel): 1–2 alternatives when plausible
- Never invent rare variants; alternatives must be realistic for the photos/analysis
- Empty string value only if truly unknown; prefer medium/low confidence instead
- No markdown, no commentary outside JSON`;

function scoreToConfidence(score?: number): ListingFieldConfidence {
  if (typeof score !== "number" || !Number.isFinite(score)) return "medium";
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function fieldsForItemType(itemType: ListingAnalysisResult["item_type"]): readonly string[] {
  if (itemType === "part") return PART_FIELDS;
  if (itemType === "apparel") return APPAREL_FIELDS;
  return BIKE_FIELDS;
}

function buildAnalysisContext(analysis: ListingAnalysisResult): string {
  return JSON.stringify(
    {
      item_type: analysis.item_type,
      brand: analysis.brand,
      model: analysis.model,
      title: analysis.title ?? analysis.clean_title,
      model_year: analysis.model_year ?? analysis.web_enrichment?.model_year_confirmed,
      condition_rating: analysis.condition_rating,
      condition_details: analysis.condition_details,
      description: analysis.description ?? analysis.web_enrichment?.product_description,
      bike_details: analysis.bike_details,
      part_details: analysis.part_details,
      apparel_details: analysis.apparel_details,
      detected_components: analysis.detected_components,
      field_confidence: analysis.field_confidence,
      price_estimate: analysis.price_estimate,
      analysis_notes: analysis.analysis_notes,
      web_enrichment: analysis.web_enrichment,
    },
    null,
    2,
  );
}

function normaliseConfidence(raw: unknown): ListingFieldConfidence {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function normaliseFieldEntry(raw: unknown): ListingAiFieldSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const value = typeof entry.value === "string" ? entry.value.trim() : "";
  const confidence = normaliseConfidence(entry.confidence);
  const alternatives = Array.isArray(entry.alternatives)
    ? entry.alternatives
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

  const uniqueAlternatives = [...new Set(alternatives)].filter((alt) => alt !== value);

  if (!value && uniqueAlternatives.length === 0) return null;

  return {
    value,
    confidence,
    alternatives: uniqueAlternatives.length > 0 ? uniqueAlternatives : undefined,
  };
}

export function analysisToAiFieldsFallback(analysis: ListingAnalysisResult): ListingAiFieldsMap {
  const bike = analysis.bike_details;
  const part = analysis.part_details;
  const apparel = analysis.apparel_details;
  const fc = analysis.field_confidence;

  const title =
    analysis.clean_title ||
    analysis.title ||
    analysis.web_enrichment?.clean_title ||
    [analysis.brand, analysis.model, analysis.model_year].filter(Boolean).join(" ");

  const fields: ListingAiFieldsMap = {
    title: { value: title, confidence: scoreToConfidence(fc?.brand) },
    brand: { value: analysis.brand ?? "", confidence: scoreToConfidence(fc?.brand) },
    model: { value: analysis.model ?? "", confidence: scoreToConfidence(fc?.model) },
    condition: { value: analysis.condition_rating ?? "", confidence: scoreToConfidence(fc?.condition) },
  };

  if (analysis.item_type === "bike") {
    fields.bikeType = {
      value: bike?.bike_type ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
    fields.year = {
      value: analysis.model_year ?? analysis.web_enrichment?.model_year_confirmed ?? "",
      confidence: scoreToConfidence(fc?.model),
    };
    fields.frameSize = {
      value: bike?.frame_size ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
    fields.frameMaterial = {
      value: bike?.frame_material ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
    fields.colourPrimary = {
      value: bike?.color_primary ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
    fields.wheelSize = {
      value: bike?.wheel_size ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
    fields.groupset = {
      value: bike?.groupset ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
    fields.suspension = {
      value: bike?.suspension_type ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
    fields.weight = {
      value: bike?.approximate_weight ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
  }

  if (analysis.item_type === "part") {
    fields.partType = {
      value: part?.part_type ?? part?.category ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
  }

  if (analysis.item_type === "apparel") {
    fields.size = {
      value: apparel?.size ?? "",
      confidence: scoreToConfidence(fc?.specifications),
    };
  }

  for (const key of Object.keys(fields)) {
    if (!fields[key]?.value) delete fields[key];
  }

  return fields;
}

export async function generateListingFieldSuggestions(
  analysis: ListingAnalysisResult,
): Promise<ListingAiFieldsMap> {
  if (!process.env.OPENAI_API_KEY) {
    return analysisToAiFieldsFallback(analysis);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const fieldKeys = fieldsForItemType(analysis.item_type);

  try {
    const response = await openai.chat.completions.create({
      model: SUGGESTIONS_MODEL,
      temperature: 0.35,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "Field keys to return:",
            fieldKeys.join(", "),
            "",
            "Photo analysis payload:",
            buildAnalysisContext(analysis),
          ].join("\n"),
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return analysisToAiFieldsFallback(analysis);

    const parsed = JSON.parse(content) as { fields?: Record<string, unknown> };
    const rawFields: Record<string, unknown> =
      parsed.fields ?? (parsed as Record<string, unknown>);
    const result: ListingAiFieldsMap = {};

    for (const key of fieldKeys) {
      const entry = normaliseFieldEntry(rawFields[key]);
      if (entry) result[key] = entry;
    }

    if (Object.keys(result).length === 0) return analysisToAiFieldsFallback(analysis);
    return result;
  } catch (error) {
    console.warn("[listing-field-suggestions] nano model failed:", error);
    return analysisToAiFieldsFallback(analysis);
  }
}
