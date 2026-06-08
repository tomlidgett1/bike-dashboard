import OpenAI from "openai";
import type { BikeSpecSection } from "@/lib/types/bike-specs";

export const BIKE_SPECS_CLEAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
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
  },
} as const;

export const BIKE_SPECS_CLEAN_PROMPT = `You are a copy editor for Yellow Jersey, an Australian online cycling marketplace.

You receive structured bicycle specifications extracted from manufacturer pages. Polish the text for ecommerce product pages.

RULES:
- Keep every spec row in the same section, in the same order — do not add, remove, merge, or reorder rows
- Preserve all technical facts: model numbers, sizes, weights, materials, standards, and component names must stay accurate
- Australian English spelling (colour, aluminium, tyres, disc brakes, etc.)
- Fix messy punctuation and spacing: duplicate commas, stray commas, double spaces, broken list separators
- Write clear, professional listing copy — concise and scannable, not marketing fluff
- Labels: short, consistent, title case where appropriate, no trailing colons
- Values: tidy comma-separated component descriptions; use " / " between alternatives; use semicolons only when separating distinct attributes
- Do NOT invent specs, omit details, add URLs, or change verified measurements
- Weight values must still include the frame size they apply to when that was provided

Return JSON with the same sections array structure, with cleaned title, label, and value strings only.`;

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

function parseCleanSections(raw: unknown): BikeSpecSection[] | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { sections?: unknown };
  if (!Array.isArray(data.sections)) return null;

  const sections: BikeSpecSection[] = [];
  for (const section of data.sections) {
    if (!section || typeof section !== "object") continue;
    const title = String((section as { title?: unknown }).title ?? "").trim();
    const specsRaw = (section as { specs?: unknown }).specs;
    if (!title || !Array.isArray(specsRaw)) continue;

    const specs = specsRaw
      .filter((spec) => spec && typeof spec === "object")
      .map((spec) => ({
        label: String((spec as { label?: unknown }).label ?? "").trim(),
        value: String((spec as { value?: unknown }).value ?? "").trim(),
      }))
      .filter((spec) => spec.label && spec.value);

    if (specs.length > 0) {
      sections.push({ title, specs });
    }
  }

  return sections.length > 0 ? sections : null;
}

function extractCleanJson(text: string): BikeSpecSection[] | null {
  const trimmed = text.trim();
  try {
    return parseCleanSections(JSON.parse(trimmed));
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return parseCleanSections(JSON.parse(match[0]));
    } catch {
      return null;
    }
  }
}

/** Apply AI-polished copy by position, falling back to the original row if a match is missing. */
export function mergeCleanedSections(
  original: BikeSpecSection[],
  cleaned: BikeSpecSection[]
): BikeSpecSection[] {
  return original.map((section, sectionIndex) => {
    const cleanedSection =
      cleaned[sectionIndex] ??
      cleaned.find(
        (candidate) =>
          candidate.title.trim().toLowerCase() === section.title.trim().toLowerCase()
      );

    if (!cleanedSection) {
      return section;
    }

    return {
      title: cleanedSection.title.trim() || section.title,
      specs: section.specs.map((spec, specIndex) => {
        const cleanedSpec =
          cleanedSection.specs[specIndex] ??
          cleanedSection.specs.find(
            (candidate) =>
              candidate.label.trim().toLowerCase() === spec.label.trim().toLowerCase()
          );

        if (!cleanedSpec) {
          return spec;
        }

        return {
          label: cleanedSpec.label.trim() || spec.label,
          value: cleanedSpec.value.trim() || spec.value,
        };
      }),
    };
  });
}

export async function cleanBikeSpecsWithAI(
  openai: OpenAI,
  sections: BikeSpecSection[],
  options?: { model?: string; productName?: string }
): Promise<BikeSpecSection[]> {
  const model = options?.model ?? "gpt-5.4";

  const response = await openai.responses.create({
    model,
    instructions: BIKE_SPECS_CLEAN_PROMPT,
    text: {
      format: {
        type: "json_schema",
        name: "bike_specs_clean",
        strict: true,
        schema: BIKE_SPECS_CLEAN_JSON_SCHEMA,
      },
    },
    input: `Polish these bicycle specifications for our marketplace listing${
      options?.productName ? `: ${options.productName}` : ""
    }.

${JSON.stringify({ sections }, null, 2)}`,
  });

  const cleaned = extractCleanJson(
    extractOutputText(response.output as ResponseOutputItem[] | undefined)
  );

  if (!cleaned) {
    return sections;
  }

  return mergeCleanedSections(sections, cleaned);
}
