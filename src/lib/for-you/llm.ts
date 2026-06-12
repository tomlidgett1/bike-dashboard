import OpenAI from "openai";
import { numberFromDb } from "@/lib/marketplace/public-card-feed";
import type { PublicMarketplaceCardRow } from "@/lib/marketplace/public-card-feed";
import type { ForYouCarouselDef, LlmBehaviouralSummary } from "./types";

// ============================================================
// LLM feed enhancement
// ============================================================
// The LLM never discovers products. It receives the deterministic carousels
// plus the validated candidate pool, and may regroup, retitle, rerank and
// suppress. Output is strictly validated; any failure keeps the
// deterministic feed.

const ENHANCE_MODEL = "gpt-5.4-nano";
const LLM_TIMEOUT_MS = 12_000;
const MAX_CANDIDATE_LINES = 170;
const MAX_OUTPUT_CAROUSELS = 9;
const MIN_OUTPUT_CAROUSELS = 3;
const MIN_CAROUSEL_ITEMS = 4;
const MAX_CAROUSEL_ITEMS = 14;
const MAX_PRODUCT_FREQUENCY = 2;

// Never surface mechanical/AI language to shoppers.
const BANNED_TITLE_PATTERN =
  /\b(ai|a\.i\.|algorithm|machine.?learn|neural|model|personali[sz]ed carousel|recommendation engine|behaviou?ral|inference|data.?driven)\b/i;

const SYSTEM_PROMPT = `You curate the "For You" homepage for Yellow Jersey, an Australian cycling marketplace.

You receive:
1. A shopper summary (inferred interests — categories, brands, price band, recent searches and views).
2. The current draft carousels (already good; improve, don't degrade).
3. A candidate catalogue. THESE ARE THE ONLY PRODUCTS THAT EXIST.

Your job: return the strongest possible set of carousels for this shopper.
- Regroup, rerank, retitle, merge or drop carousels.
- Order carousels by usefulness to this shopper.
- Within each carousel, order products best-first.
- Prefer fewer, stronger carousels over many weak ones.
- Avoid showing the same product in more than 2 carousels.
- Keep variety: mix relevance, freshness, value, trusted stores, and one discovery angle.
- Respect the shopper's likely budget; don't lead with products wildly above it.

Titles: short (max 55 chars), natural, commercial. Like "Because you've been browsing gravel bikes" or "Strong value under $2,000". NEVER mention AI, algorithms, models, or data.
Explanations: optional, max 80 chars, plain language, no unsupported claims.

HARD RULES:
- product_ids MUST come from the candidate catalogue. Never invent IDs.
- Each carousel needs >= ${MIN_CAROUSEL_ITEMS} products.
- Max ${MAX_OUTPUT_CAROUSELS} carousels.
- Keep the "recently-viewed" carousel's products unchanged if you keep it.

Return JSON only:
{"carousels":[{"key":"slug","title":"...","explanation":"... (optional)","product_ids":["uuid",...]}]}`;

function candidateLine(row: PublicMarketplaceCardRow): string {
  const title = (row.display_name || row.description || "Untitled").replace(/\s+/g, " ").slice(0, 70);
  const price = numberFromDb(row.price);
  const flags = [
    row.is_verified_bike_store ? "verified-store" : null,
    row.discount_active ? "discounted" : null,
    row.condition_rating || null,
    row.created_at && Date.now() - new Date(row.created_at).getTime() < 7 * 86400_000
      ? "new-this-week"
      : null,
  ]
    .filter(Boolean)
    .join(",");
  const category = [row.marketplace_category, row.marketplace_subcategory]
    .filter(Boolean)
    .join(">");
  return `${row.id}|${title}|${row.brand || "-"}|${category || "-"}|$${Math.round(price)}|${flags || "-"}`;
}

function summaryBlock(summary: LlmBehaviouralSummary): string {
  const lines: string[] = [];
  if (summary.categories.length) {
    lines.push(
      `Category interest: ${summary.categories.map((c) => `${c.value} (${c.weight.toFixed(1)})`).join(", ")}`,
    );
  }
  if (summary.subcategories.length) {
    lines.push(`Subcategories: ${summary.subcategories.map((s) => s.value).join(", ")}`);
  }
  if (summary.brands.length) {
    lines.push(`Brand interest: ${summary.brands.map((b) => b.value).join(", ")}`);
  }
  const { p25, p50, p75 } = summary.priceBand;
  if (p50) {
    lines.push(
      `Likely budget band: $${Math.round(p25 || 0)}–$${Math.round(p75 || 0)} (median ~$${Math.round(p50)})`,
    );
  }
  if (summary.searches.length) lines.push(`Recent searches: ${summary.searches.join("; ")}`);
  if (summary.recentTitles.length) {
    lines.push(`Recently viewed: ${summary.recentTitles.join(" | ")}`);
  }
  if (summary.ridingStyles.length) {
    lines.push(`Stated riding styles: ${summary.ridingStyles.join(", ")}`);
  }
  lines.push(`Behavioural evidence: ${summary.eventCount} events`);
  return lines.length > 1 ? lines.join("\n") : "New shopper — no behavioural history yet.";
}

interface RawLlmCarousel {
  key?: unknown;
  title?: unknown;
  explanation?: unknown;
  product_ids?: unknown;
}

export function validateLlmCarousels(
  raw: unknown,
  candidateIds: Set<string>,
  deterministic: ForYouCarouselDef[],
): ForYouCarouselDef[] | null {
  if (!raw || typeof raw !== "object") return null;
  const rawCarousels = (raw as { carousels?: unknown }).carousels;
  if (!Array.isArray(rawCarousels)) return null;

  const recentlyViewedIds = new Set(
    deterministic.find((c) => c.key === "recently-viewed")?.productIds || [],
  );

  const frequency = new Map<string, number>();
  const seenKeys = new Set<string>();
  const seenTitles = new Set<string>();
  const result: ForYouCarouselDef[] = [];

  for (const entry of rawCarousels as RawLlmCarousel[]) {
    if (result.length >= MAX_OUTPUT_CAROUSELS) break;
    if (!entry || typeof entry !== "object") continue;

    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title || title.length > 60 || BANNED_TITLE_PATTERN.test(title)) continue;
    const titleKey = title.toLowerCase();
    if (seenTitles.has(titleKey)) continue;

    let key =
      typeof entry.key === "string" && /^[a-z0-9-]{2,60}$/.test(entry.key)
        ? entry.key
        : titleKey.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
    if (!key) continue;
    if (seenKeys.has(key)) continue;

    let explanation =
      typeof entry.explanation === "string" ? entry.explanation.trim().slice(0, 90) : undefined;
    if (explanation && BANNED_TITLE_PATTERN.test(explanation)) explanation = undefined;
    if (explanation === "") explanation = undefined;

    if (!Array.isArray(entry.product_ids)) continue;
    const ids: string[] = [];
    const seenInCarousel = new Set<string>();
    for (const id of entry.product_ids) {
      if (typeof id !== "string" || !candidateIds.has(id)) continue; // reject hallucinated IDs
      if (seenInCarousel.has(id)) continue;
      if ((frequency.get(id) || 0) >= MAX_PRODUCT_FREQUENCY) continue;
      // The recently-viewed carousel must stay grounded in actual history.
      if (key === "recently-viewed" && !recentlyViewedIds.has(id)) continue;
      seenInCarousel.add(id);
      ids.push(id);
      if (ids.length >= MAX_CAROUSEL_ITEMS) break;
    }

    const minItems = key === "recently-viewed" ? 3 : MIN_CAROUSEL_ITEMS;
    if (ids.length < minItems) continue;

    for (const id of ids) frequency.set(id, (frequency.get(id) || 0) + 1);
    seenKeys.add(key);
    seenTitles.add(titleKey);
    result.push({ key, title, explanation, source: "llm", productIds: ids });
  }

  // A degraded LLM page is worse than the deterministic one — reject it.
  if (result.length < MIN_OUTPUT_CAROUSELS) return null;
  const totalProducts = result.reduce((sum, c) => sum + c.productIds.length, 0);
  const deterministicTotal = deterministic.reduce((sum, c) => sum + c.productIds.length, 0);
  if (totalProducts < Math.min(20, deterministicTotal * 0.5)) return null;

  return result;
}

export async function enhanceFeedWithLlm(
  summary: LlmBehaviouralSummary,
  deterministic: ForYouCarouselDef[],
  candidates: Map<string, PublicMarketplaceCardRow>,
): Promise<{ carousels: ForYouCarouselDef[]; model: string } | null> {
  if (!process.env.OPENAI_API_KEY || candidates.size === 0 || deterministic.length === 0) {
    return null;
  }

  // Cap the catalogue: products already in carousels first, then the rest.
  const inFeed = new Set(deterministic.flatMap((c) => c.productIds));
  const orderedRows: PublicMarketplaceCardRow[] = [];
  for (const id of inFeed) {
    const row = candidates.get(id);
    if (row) orderedRows.push(row);
  }
  for (const [id, row] of candidates) {
    if (orderedRows.length >= MAX_CANDIDATE_LINES) break;
    if (!inFeed.has(id)) orderedRows.push(row);
  }
  const catalogue = orderedRows.slice(0, MAX_CANDIDATE_LINES);
  const candidateIds = new Set(catalogue.map((r) => r.id));

  const draft = deterministic.map((c) => ({
    key: c.key,
    title: c.title,
    explanation: c.explanation,
    product_ids: c.productIds.filter((id) => candidateIds.has(id)),
  }));

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: LLM_TIMEOUT_MS });

  try {
    const response = await openai.chat.completions.create({
      model: ENHANCE_MODEL,
      temperature: 0.3,
      max_completion_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "Shopper summary:",
            summaryBlock(summary),
            "",
            "Draft carousels (JSON):",
            JSON.stringify(draft),
            "",
            "Candidate catalogue (id|title|brand|category|price|flags):",
            catalogue.map(candidateLine).join("\n"),
          ].join("\n"),
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as unknown;
    const validated = validateLlmCarousels(parsed, candidateIds, deterministic);
    if (!validated) {
      console.warn("[for-you] LLM output failed validation; keeping deterministic feed");
      return null;
    }
    return { carousels: validated, model: ENHANCE_MODEL };
  } catch (error) {
    console.warn("[for-you] LLM enhancement failed:", error);
    return null;
  }
}
