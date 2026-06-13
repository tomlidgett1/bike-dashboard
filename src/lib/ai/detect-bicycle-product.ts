import OpenAI from "openai";

const MODEL = "gpt-5.4-nano";

const DETECT_PROMPT = `You classify cycling marketplace products as complete bicycles or not.

Set is_bicycle to true ONLY for:
- Complete bicycles (road, mountain, gravel, hybrid, commuter, BMX, kids bikes, cargo bikes, tandem, etc.)
- E-bikes sold as a complete bicycle
- Framesets where the primary listing is the frame (often sold as a frameset kit)

Set is_bicycle to false for:
- Components, parts, wheels, tyres, groupsets, handlebars, saddles, pedals
- Apparel, helmets, shoes, gloves
- Accessories, tools, nutrition, bike racks, trainers, computers, lights
- Any product that is not a complete bicycle or frameset listing

Use the product name, category, and any description/spec context provided. When uncertain, prefer false.`;

export const BICYCLE_DETECT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_bicycle", "confidence"],
  properties: {
    is_bicycle: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

export type BicycleDetection = {
  is_bicycle: boolean;
  confidence: "high" | "medium" | "low";
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
      if (content.type === "output_text" && content.text) text += content.text;
    }
  }
  return text;
}

function parseDetection(raw: string): BicycleDetection | null {
  try {
    const parsed = JSON.parse(raw.trim()) as Partial<BicycleDetection>;
    if (typeof parsed.is_bicycle !== "boolean") return null;
    const confidence =
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "medium";
    return { is_bicycle: parsed.is_bicycle, confidence };
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return parseDetection(match[0]);
    } catch {
      return null;
    }
  }
}

export async function detectBicycleProduct(
  openai: OpenAI,
  details: string,
): Promise<BicycleDetection> {
  const response = await openai.responses.create({
    model: MODEL,
    instructions: DETECT_PROMPT,
    text: {
      format: {
        type: "json_schema",
        name: "bicycle_detection",
        strict: true,
        schema: BICYCLE_DETECT_JSON_SCHEMA,
      },
    },
    input: `Classify this cycling product:\n\n${details}`,
  });

  const parsed = parseDetection(
    extractOutputText(response.output as ResponseOutputItem[] | undefined),
  );

  return parsed ?? { is_bicycle: false, confidence: "low" };
}
