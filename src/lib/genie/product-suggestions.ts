import OpenAI from "openai";
import {
  formatProductGenieListingForModel,
  type ProductGenieContext,
} from "@/lib/genie/product-context";

export const FALLBACK_PRODUCT_GENIE_SUGGESTIONS = [
  "Is this good value at this price?",
  "Would this suit my kind of riding?",
  "Any similar options on Yellow Jersey?",
] as const;

const SUGGESTIONS_MODEL = "gpt-5.4-nano";

const SYSTEM_PROMPT = `You write quick-tap starter questions for a shopper on Yellow Jersey, an Australian bike marketplace.

Each chip is sent to Yellow Jersey Genius — an AI assistant, NOT the seller. Every question MUST be something Genius can actually answer using:
1) the listing data provided,
2) web search (manufacturer specs, geometry, sizing guides, compatibility, reviews, typical pricing), and/or
3) Yellow Jersey marketplace search (similar in-stock listings).

Never suggest questions that only the seller could answer (negotiation, pickup times, hidden history, "why selling", "best price", "can you throw in…").

Return JSON only: { "suggestions": ["...", "...", "..."] }

Quality bar:
- Genuine shopper curiosity — practical, conversational, helps them decide
- Genius must be able to give a useful answer without contacting the seller
- Reference THIS listing where it helps (price, condition, size, brand/model, use case)
- Three different intents Genius handles well: value/comparison, fit/suitability/specs, alternatives or "is this the right tier for me?"

Rules:
- Exactly 3 questions, each 5–14 words, max ~88 characters
- First person or direct voice ("Would this suit…", "Is $X fair for…", "How does this compare…")
- Australian English spelling
- No markdown, bullets, or quotation marks inside questions

GENIUS CAN ANSWER (good):
- "Is $4,500 fair for a used SL7 in this condition?"
- "Would a 54cm Tarmac suit a 182cm rider?"
- "How does Ultegra compare to 105 on this bike?"
- "Any cheaper road bikes like this on Yellow Jersey?"
- "Good first proper road bike or too racey?"
- "What stands out in the specs for the price?"
- "Is this model year still worth buying?"
- "Will this part fit a 2021 Trek Fuel EX?" (compatibility from specs/web)

GENIUS CANNOT ANSWER (never suggest):
- "Why is the seller getting rid of it?"
- "Can they drop the price?"
- "Can I pick up this weekend?"
- "Has it been in a crash?" (unless listing already says — still prefer spec/value/fit)
- "What's included?" when not in listing and only seller would know
- "What's the warranty on this private sale?" (seller-specific)
- Robotic spec quizzes: "Does it have Ultegra?"`;

function buildSuggestionAngles(product: ProductGenieContext): string {
  const angles: string[] = [
    "Genius tools: listing text, web search for OEM specs/geometry/reviews/market pricing, marketplace search for alternatives.",
    "Do NOT suggest seller-only questions (negotiation, pickup, motivation, undisclosed history).",
  ];
  const category = product.category?.toLowerCase() ?? "";
  const isBike =
    category.includes("bicycle") ||
    Boolean(product.bikeType) ||
    Boolean(product.frameSize) ||
    Boolean(product.groupset);
  const isUsed =
    product.condition &&
    !/new|not rated — store inventory/i.test(product.condition);

  if (isBike) {
    angles.push(
      "Bike ideas Genius can answer: fit vs frame size (geometry charts), riding style match, groupset tier vs price, used-market value, model-year relevance, common spec highlights, similar bikes on Yellow Jersey.",
    );
  } else if (category.includes("part")) {
    angles.push(
      "Parts ideas: compatibility (web + listing), spec quality vs price, typical retail comparison, alternatives on Yellow Jersey.",
    );
  } else if (category.includes("apparel") || category.includes("helmet")) {
    angles.push(
      "Apparel ideas: sizing guidance from brand charts, use case (summer, aero, comfort), value at listed price, similar listings.",
    );
  } else {
    angles.push(
      "General ideas: suitability for riding type, value at price, spec highlights, marketplace alternatives.",
    );
  }

  if (product.frameSize) {
    angles.push(`Frame size ${product.frameSize} — sizing/fit vs height question Genius can answer from geometry.`);
  }
  if (isUsed) {
    angles.push(
      `Condition: ${product.condition} — fair price vs used market, or how specs stack up for the money (not "ask seller about crashes").`,
    );
  } else if (product.condition?.toLowerCase().includes("new")) {
    angles.push("Listed as new — compare to RRP/new pricing, spec tier, or who it's best for; don't ask if it's new.");
  }
  if (product.listingType === "private_listing") {
    angles.push(
      "Private listing — stick to value, specs, fit, and marketplace alternatives; no negotiation or seller-motivation questions.",
    );
  }
  if (product.price != null && product.price > 0) {
    angles.push(`Price $${product.price.toLocaleString("en-AU")} — fair value or comparison question.`);
  }
  if (product.modelYear) {
    angles.push(`Model year ${product.modelYear} — still competitive vs newer models or worth the price?`);
  }
  if (product.includedAccessories) {
    angles.push(`Included: ${product.includedAccessories.slice(0, 80)} — can reference in a value question.`);
  }

  return angles.join("\n");
}

function buildListingContext(product: ProductGenieContext): string {
  return formatProductGenieListingForModel(product);
}

function looksLikeSpecQuiz(question: string): boolean {
  const lower = question.toLowerCase();
  return (
    /^does it (have|include|come with)\b/.test(lower) ||
    /^is this .+ (frame|groupset|carbon|alloy)\??$/.test(lower) ||
    /^what (size|wheel|tyre|tire)s? (and|&)/.test(lower)
  );
}

function looksLikeSellerOnlyQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  return (
    /\b(negotiat|best price|drop the price|lower the price|discount|offer less)\b/.test(lower) ||
    /\b(why (are you|is the seller|did they) sell|reason for selling|getting rid of)\b/.test(lower) ||
    /\b(pick up|pickup|collect) (this|next|on|at|tomorrow|weekend)\b/.test(lower) ||
    /\b(contact (the )?seller|ask the seller|message the seller)\b/.test(lower) ||
    /\b(been (in a )?crash|accident|dropped it)\b/.test(lower) ||
    /\b(throw in|include (pedals|extras)|can they include)\b/.test(lower) ||
    /\b(meet (in person|up)|available (to )?view)\b/.test(lower) ||
    /\b(return policy|refund if)\b/.test(lower) ||
    /\b(warranty from (the )?seller)\b/.test(lower)
  );
}

function normaliseSuggestions(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const suggestions = (raw as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  const seen = new Set<string>();

  return suggestions
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/^["']|["']$/g, "").replace(/\?$/, "").trim())
    .filter((item) => item.length >= 8)
    .map((item) => (item.endsWith("?") ? item : `${item}?`))
    .filter((item) => item.length <= 96)
    .filter((item) => !looksLikeSpecQuiz(item))
    .filter((item) => !looksLikeSellerOnlyQuestion(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export async function generateProductGenieSuggestions(
  product: ProductGenieContext,
): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) {
    return [...FALLBACK_PRODUCT_GENIE_SUGGESTIONS];
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: SUGGESTIONS_MODEL,
      temperature: 0.75,
      max_completion_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "Write 3 quick questions Genius can fully answer (listing + web + marketplace) — not seller-only.",
            "",
            buildListingContext(product),
            "",
            "Angles to consider:",
            buildSuggestionAngles(product),
          ].join("\n"),
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return [...FALLBACK_PRODUCT_GENIE_SUGGESTIONS];

    const parsed = JSON.parse(content) as unknown;
    const suggestions = normaliseSuggestions(parsed);
    if (suggestions.length < 3) return [...FALLBACK_PRODUCT_GENIE_SUGGESTIONS];

    return suggestions;
  } catch (error) {
    console.warn("[product-genie-suggestions] nano model failed:", error);
    return [...FALLBACK_PRODUCT_GENIE_SUGGESTIONS];
  }
}
