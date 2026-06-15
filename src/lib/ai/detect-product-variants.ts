// ============================================================
// AI variant grouping (lightweight, text-only)
// ============================================================
// Given ONE pre-filtered bucket (same brand + same base title), the
// model confirms whether the products are genuinely variants of one
// product, splits them into groups if needed (e.g. by model year),
// names the option types, and assigns each product its variant values.
//
// IMPORTANT: only compact structured fields are sent — never images,
// never full HTML descriptions. Uses the lightweight gpt-5.4-nano model.

import OpenAI from "openai";
import type { VariantBucket } from "@/lib/variants/types";

const MODEL = "gpt-5.4-nano";

const WARNING_ENUM = [
  "price_mismatch",
  "category_mismatch",
  "model_year_conflict",
  "ambiguous_titles",
  "possible_false_positive",
  "missing_sku",
  "already_lightspeed_matrix",
] as const;

const PROMPT = `You group bicycle-shop products that are the SAME product sold in different
configurations (e.g. sizes, colours, frame sizes, wheel sizes) into variant groups.

You are given a small list of products that already share a brand and a similar base name.
Decide which of them are truly variants of one product.

Each product has TWO names: "name" is the cleaned Yellow Jersey title (its size or
colour may have been removed) and "lightspeed_listing" is the original shop listing,
which usually STILL contains the size/colour. SKU fields often encode the size too.

Rules:
- Use BOTH "name" and "lightspeed_listing" (and the SKUs) to decide each product's variant
  values. If the Yellow Jersey name lost the size/colour, recover it from the Lightspeed
  listing or SKU.
- Be MORE confident (confidence "high") when the Lightspeed listings clearly show a distinct
  size/colour for each product. Be cautious (confidence "low" or warning "possible_false_positive")
  when neither the names nor the Lightspeed listings distinguish the products — they may be
  duplicates, not variants.
- Only group products that are genuinely the same product in a different size/colour/etc.
- NEVER group different brands or clearly different models.
- Split different model years into SEPARATE groups; only keep them together if you are very
  confident, and then add the warning "model_year_conflict".
- Name option types in plain words: "Size", "Colour", "Frame Size", "Wheel Size", "Gender".
  A product may have more than one option type (e.g. Size AND Colour).
- master_title is the shared product name WITHOUT the size/colour/etc. (e.g. "Giro Fixture Helmet").
- For each product, give its value for every option type you named.
- A valid group needs at least 2 products. Drop products that don't belong.
- Add warnings when relevant: price_mismatch, category_mismatch, ambiguous_titles,
  possible_false_positive, missing_sku.
- If none of the products are variants of each other, return an empty groups array.
- Set is_variant_group=false for any group you are not confident about.`;

export const VARIANT_DETECT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["is_variant_group", "master_title", "option_types", "items", "confidence", "explanation", "warnings"],
        properties: {
          is_variant_group: { type: "boolean" },
          master_title: { type: "string" },
          option_types: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name"],
              properties: { name: { type: "string" } },
            },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["ref", "values"],
              properties: {
                ref: { type: "string" },
                values: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["option", "value"],
                    properties: {
                      option: { type: "string" },
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          explanation: { type: "string" },
          warnings: { type: "array", items: { type: "string", enum: WARNING_ENUM } },
        },
      },
    },
  },
} as const;

export type RawVariantGroup = {
  is_variant_group: boolean;
  master_title: string;
  option_types: { name: string }[];
  items: { ref: string; values: { option: string; value: string }[] }[];
  confidence: "high" | "medium" | "low";
  explanation: string;
  warnings: string[];
};

type ResponseOutputItem = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

function extractOutputText(output: ResponseOutputItem[] | undefined): string {
  let text = "";
  for (const item of output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) text += content.text;
    }
  }
  return text;
}

function parseGroups(raw: string): RawVariantGroup[] {
  const tryParse = (s: string): RawVariantGroup[] | null => {
    try {
      const parsed = JSON.parse(s.trim()) as { groups?: RawVariantGroup[] };
      return Array.isArray(parsed.groups) ? parsed.groups : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(raw);
  if (direct) return direct;
  const match = raw.match(/\{[\s\S]*\}/);
  return (match && tryParse(match[0])) || [];
}

/** Build the compact, image-free payload sent to the model. `ref` maps back to product_id. */
export function buildBucketPrompt(bucket: VariantBucket): { input: string; refToProductId: Map<string, string> } {
  const refToProductId = new Map<string, string>();
  const lines = bucket.products.map((p, index) => {
    const ref = `p${index}`;
    refToProductId.set(ref, p.product_id);
    return {
      ref,
      name: p.title,
      // Original shop listing — usually still contains the size/colour.
      lightspeed_listing: p.lightspeed_description && p.lightspeed_description !== p.title ? p.lightspeed_description : null,
      brand: p.brand,
      category: p.category_name,
      sku: p.system_sku || p.custom_sku || null,
      manufacturer_sku: p.manufacturer_sku,
      upc: p.upc,
      price: p.price,
      qoh: p.qoh,
      model_year: p.model_year,
      size: p.size,
      frame_size: p.frame_size,
      wheel_size: p.wheel_size,
      colour: p.color_primary,
      colour_secondary: p.color_secondary,
    };
  });

  const input = `Brand: ${bucket.brand ?? "unknown"}
Suggested base name: ${bucket.base_title}
Products (group these by their shared product, assign option values):
${JSON.stringify(lines)}`;

  return { input, refToProductId };
}

/** Run the model for one bucket. Returns the raw groups (ref-based) for pure mapping. */
export async function detectVariantGroupsForBucket(
  openai: OpenAI,
  bucket: VariantBucket,
): Promise<{ groups: RawVariantGroup[]; refToProductId: Map<string, string> }> {
  const { input, refToProductId } = buildBucketPrompt(bucket);

  const response = await openai.responses.create({
    model: MODEL,
    instructions: PROMPT,
    text: {
      format: {
        type: "json_schema",
        name: "variant_groups",
        strict: true,
        schema: VARIANT_DETECT_JSON_SCHEMA,
      },
    },
    input,
  });

  const groups = parseGroups(extractOutputText(response.output as ResponseOutputItem[] | undefined));
  return { groups, refToProductId };
}
