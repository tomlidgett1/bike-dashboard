/**
 * Proactive Nest shopping nudge — generates one short, contextual question
 * after a shopper has been browsing. Uses the same brand persona/facts as
 * the storefront chat agent (e.g. Ash for Ashburton Cycles).
 */

import OpenAI from "openai";
import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";
import { loadPromptCoachContext } from "@/lib/nest/prompt-coach";

const PROACTIVE_MODEL = "gpt-5.5";

export type StorefrontBrowseContextPayload = {
  scrollEngagementSeconds?: number;
  maxScrollDepthPct?: number;
  focusProduct?: {
    name?: string;
    brand?: string | null;
    category?: string | null;
    price?: number | null;
    dwellSeconds?: number;
  } | null;
  currentlyVisible?: Array<{
    name?: string;
    brand?: string | null;
    category?: string | null;
    price?: number | null;
  }>;
  products?: Array<{
    name?: string;
    brand?: string | null;
    category?: string | null;
    price?: number | null;
    dwellSeconds?: number;
  }>;
  brands?: string[];
  categories?: string[];
  searches?: string[];
  tabs?: string[];
  activeCategory?: string | null;
  activeTab?: string | null;
  priceBand?: { min?: number; max?: number } | null;
  path?: string | null;
  interestSummary?: string;
};

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatProductLine(product: {
  name?: string;
  brand?: string | null;
  category?: string | null;
  price?: number | null;
  dwellSeconds?: number;
}): string | null {
  const name = product.name?.trim();
  if (!name) return null;
  const bits = [
    product.brand?.trim(),
    name,
    product.category?.trim() ? `(${product.category.trim()})` : null,
    typeof product.price === "number" ? `$${Math.round(product.price)}` : null,
    typeof product.dwellSeconds === "number" && product.dwellSeconds > 0
      ? `${product.dwellSeconds}s looking`
      : null,
  ].filter(Boolean);
  return bits.join(" ");
}

function buildBrowseBlock(browse: StorefrontBrowseContextPayload): string {
  const focus = browse.focusProduct
    ? formatProductLine(browse.focusProduct)
    : null;
  const visible = (browse.currentlyVisible ?? [])
    .map((product) => formatProductLine(product))
    .filter(Boolean);
  const products = (browse.products ?? [])
    .map((product) => formatProductLine(product))
    .filter(Boolean);

  const lines = [
    browse.interestSummary?.trim()
      ? `Interest summary: ${truncate(browse.interestSummary, 360)}`
      : null,
    focus ? `FOCUS PRODUCT (ask about this): ${focus}` : null,
    visible.length > 0 ? `On screen right now: ${visible.slice(0, 4).join("; ")}` : null,
    products.length > 0 ? `Also browsed: ${products.slice(0, 5).join("; ")}` : null,
    (browse.brands ?? []).length > 0
      ? `Brands of interest: ${browse.brands!.slice(0, 5).join(", ")}`
      : null,
    browse.activeCategory
      ? `Active category filter: ${browse.activeCategory}`
      : (browse.categories ?? []).length > 0
        ? `Categories: ${browse.categories!.slice(0, 5).join(", ")}`
        : null,
    (browse.searches ?? []).length > 0
      ? `Searches: ${browse.searches!.slice(0, 4).join(", ")}`
      : null,
    browse.activeTab ? `Current tab: ${browse.activeTab}` : null,
    browse.priceBand &&
    typeof browse.priceBand.min === "number" &&
    typeof browse.priceBand.max === "number"
      ? `Price band they are in: $${Math.round(browse.priceBand.min)}–$${Math.round(browse.priceBand.max)}`
      : null,
    typeof browse.scrollEngagementSeconds === "number"
      ? `Scroll engagement: ~${browse.scrollEngagementSeconds}s`
      : null,
    browse.path ? `Current path: ${browse.path}` : null,
  ].filter(Boolean);

  return lines.join("\n") || "Browsing the store generally.";
}

function buildFallbackQuestion(browse: StorefrontBrowseContextPayload): string {
  const focus = browse.focusProduct;
  const visible = browse.currentlyVisible?.[0];
  const product = focus?.name?.trim() || visible?.name?.trim();
  const brand = focus?.brand?.trim() || visible?.brand?.trim() || browse.brands?.[0];
  const category =
    browse.activeCategory?.trim() ||
    focus?.category?.trim() ||
    browse.categories?.[0]?.trim();
  const search = browse.searches?.[0]?.trim();

  if (product && brand) {
    return `Is the ${brand} ${product} for racing, or more weekend rides?`;
  }
  if (product) {
    return `Still looking at the ${product} — want help choosing a size?`;
  }
  if (brand && category) {
    return `Comparing ${brand} options in ${category}? I can narrow it down.`;
  }
  if (brand) {
    return `Interested in ${brand}? Want the best match for how you ride?`;
  }
  if (category) {
    return `Shopping ${category} — commuting, fitness, or something faster?`;
  }
  if (search) {
    return `Still after “${search}”? Want me to shortlist a couple?`;
  }
  return "Need a hand finding the right bike or gear?";
}

export async function generateStorefrontProactiveNudge(args: {
  brandKey: string;
  storeName: string;
  browse: StorefrontBrowseContextPayload;
}): Promise<{
  question: string;
  assistantLabel: string;
  storeName: string;
}> {
  const openaiKey = pickServerEnv(["OPENAI_API_KEY", "NEST_OPENAI_API_KEY"]);
  if (!openaiKey) {
    throw new Error("AI is not configured for website chat.");
  }

  const ctx = await loadPromptCoachContext(args.brandKey);
  const storeName =
    ctx.config.business_display_name?.trim() || args.storeName || args.brandKey;
  const assistantLabel = storeName;

  const styleNotes = ctx.config.style_notes?.trim() || "";
  const openingLine = ctx.config.opening_line?.trim() || "";
  const services = ctx.config.services_products_text?.trim() || "";

  const browseBlock = buildBrowseBlock(args.browse);
  const hasSpecificSignal = Boolean(
    args.browse.focusProduct?.name ||
      (args.browse.currentlyVisible ?? []).length > 0 ||
      (args.browse.products ?? []).length > 0 ||
      (args.browse.brands ?? []).length > 0 ||
      args.browse.activeCategory ||
      (args.browse.searches ?? []).length > 0,
  );

  const client = new OpenAI({ apiKey: openaiKey });
  const completion = await client.chat.completions.create({
    model: PROACTIVE_MODEL,
    max_completion_tokens: 140,
    messages: [
      {
        role: "system",
        content: `You are the proactive shopping assistant for ${storeName}, a real local Australian bike shop (Nest brand voice / Ash-style floor staff). You appear as a small corner popup after a customer has been browsing.

Write ONE short question (max 20 words) that proves you understand exactly what they are looking at.

Hard rules:
- Australian English, warm, natural, contracted. No corporate speak.
- If a FOCUS PRODUCT is provided, you MUST mention that product name (or its brand + short model) in the question.
- If no focus product but brands/categories/searches exist, you MUST mention the most specific one.
- Never ask a generic line like "Need a hand finding the right bike or gear?" when any specific signal exists.
- Prefer a useful shopping angle: riding use, size/fit, compare vs another brand they browsed, budget around the price they are looking at, or next accessory/service step.
- Plain text only. No markdown, no emoji, no quotation marks wrapping the whole question.
- Never invent stock, discounts, or promotions.
- Avoid "I noticed you…" openers. Sound like a staffer who walked over.
- Never mention AI, Nest, or Yellow Jersey.

Good examples:
- "Is the Focus Izalco Max for race days, or more weekend group rides?"
- "Looking at Trek Madones around $8k — want help picking a size?"
- "Comparing Cervelo and Factor in road bikes — what’s the ride style?"

Bad examples:
- "Need any help today?"
- "Can I help you find something?"
- "Browsing our range?"

Store voice notes: ${truncate(styleNotes || "Friendly local bike shop.", 400)}
Opening vibe: ${truncate(openingLine || "Happy to help.", 200)}
Services/products hint: ${truncate(services || "Bikes, parts, accessories, service.", 400)}`,
      },
      {
        role: "user",
        content: `Customer browse context:\n${browseBlock}\n\n${
          hasSpecificSignal
            ? "Write the single popup question now. It must name the focus product/brand/category from the context."
            : "Write the single popup question now."
        }`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";
  let question = raw
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // If the model went generic despite having specifics, force a contextual fallback.
  const focusName = args.browse.focusProduct?.name?.trim().toLowerCase();
  const focusBrand = args.browse.focusProduct?.brand?.trim().toLowerCase();
  const lowered = question.toLowerCase();
  const tooGeneric =
    !question ||
    /need a hand finding|any help today|can i help you find|browsing our range|looking for something\?/.test(
      lowered,
    ) ||
    (hasSpecificSignal &&
      focusName &&
      !lowered.includes(focusName.split(" ")[0] ?? "") &&
      !(focusBrand && lowered.includes(focusBrand)));

  if (tooGeneric) {
    question = buildFallbackQuestion(args.browse);
  }

  return { question: truncate(question, 160), assistantLabel, storeName };
}
