/**
 * Draft an Instagram caption from the creative prompt (Australian English).
 */

import OpenAI from "openai";
import type { InstagramDestination } from "@/lib/instagram/formats";

const CAPTION_MODEL =
  process.env.INSTAGRAM_CAPTION_MODEL?.trim() || "gpt-4.1-mini";

function getOpenAI() {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() || process.env.NEST_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({ apiKey });
}

export async function generateInstagramCaption(params: {
  prompt: string;
  storeUsername?: string | null;
  destination?: InstagramDestination;
  /** Catalogue facts (name, price, description) when a product is selected. */
  productFacts?: string | null;
}): Promise<string> {
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required to draft a caption.");
  }

  const isStory = params.destination === "story";
  const productFacts = params.productFacts?.trim() || "";
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: CAPTION_MODEL,
    temperature: 0.8,
    max_tokens: isStory ? 80 : 220,
    messages: [
      {
        role: "system",
        content: isStory
          ? [
              "You write short Instagram Story overlay text for Australian bicycle stores.",
              "Use Australian English spelling.",
              "Return ONLY the text. No quotes, no markdown, no hashtags.",
              "Max 12 words. Punchy, clear, retail-friendly.",
              productFacts
                ? "If the brief mentions price or a discount, use only the prices from the product facts."
                : "Do not invent prices.",
            ].join(" ")
          : [
              "You write Instagram captions for Australian bicycle stores.",
              "Use Australian English spelling (e.g. organise, favourite, colour).",
              "Tone: warm, confident, retail-friendly, not cringe.",
              "Return ONLY the caption text. No quotes, no markdown, no label.",
              "Length: 1–3 short sentences, then 3–6 relevant hashtags on a new line.",
              "Use the product description to inform benefits and wording when product facts are provided.",
              productFacts
                ? "You may quote prices and discounts only from the product facts. Do not invent prices, phone numbers, or sale end dates."
                : "Do not invent prices, phone numbers, or sale end dates.",
              "Avoid emojis unless one subtle emoji fits naturally.",
            ].join(" "),
      },
      {
        role: "user",
        content: [
          `Image creative brief: ${prompt}`,
          productFacts ? `Product facts:\n${productFacts}` : null,
          params.storeUsername
            ? `Store Instagram handle: @${params.storeUsername.replace(/^@/, "")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const caption = response.choices[0]?.message?.content?.trim() || "";
  if (!caption) {
    throw new Error("OpenAI did not return a caption.");
  }

  return caption.replace(/^["']|["']$/g, "").trim();
}
