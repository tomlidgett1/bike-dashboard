/**
 * Stage 4 — AI triage + select, then hero lock.
 *
 * Same two-stage funnel philosophy as the existing catalogue selector, but it
 * now runs over a pool that has already been quality-gated and de-duplicated,
 * so the model spends its attention on real decisions (which variant, which is
 * the best packshot) instead of filtering out junk. We also fuse the model's
 * primary pick with a programmatic packshot score (background whiteness +
 * resolution + official source) to lock a reliable hero.
 */

import OpenAI from "openai";
import type { AnalyzedCandidate, ProductInput, SelectedImage } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TRIAGE_MODEL = "gpt-5.4-mini";
const SELECT_FAST_MODEL = "gpt-5.4-mini";
const SELECT_FULL_MODEL = "gpt-5.4";

const SHORTLIST_MAX = 14;
const TARGET_MIN = 2;

// gpt-5.4 vision pricing (per token) — mirrors the existing selector.
const INPUT_COST = 10.0 / 1_000_000;
const CACHED_COST = 2.5 / 1_000_000;
const OUTPUT_COST = 40.0 / 1_000_000;

const INFO_PANEL_RE =
  /nutrition|ingredient|supplement\s*facts|\bfacts\b|spec(?:s|ification)?\b|sizing|directions|how to use|back[\s-]?of[\s-]?pack|\bpanel\b|infographic|\blabel\b/i;

interface TriageResult {
  matches: Array<{ index: number; reason: string }>;
  reasoning: string;
}
interface SelectResult {
  selectedImages: Array<{ index: number; isPrimary: boolean; reason: string }>;
  reasoning: string;
}
interface TokenUsage {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
}

function identityLines(p: ProductInput): string {
  return [
    `Product name: "${p.name}"`,
    p.brand ? `Brand: "${p.brand}"` : null,
    p.upc ? `UPC/barcode: "${p.upc}"` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTriagePrompt(p: ProductInput, count: number): string {
  return `You are screening web-search image results for a cycling e-commerce listing.
You are given ${count} candidate images. Many are the WRONG product, a different variant, a bundle,
or an accessory. Your only job here is to KEEP the ones that show the EXACT product below and
DISCARD everything else.

${identityLines(p)}

Pay close attention to qualifiers in the name: "front" vs "rear" vs "set/pair/combo", colour, size,
capacity (lumens, mAh, ml), wheel size, model year, and edition. The product name is the source of truth.
DISCARD a different model, a similar-but-different product, generic category shots, collages, heavy
watermarks, and lifestyle shots where the product is not clearly the subject. When unsure, DISCARD.

Images are numbered 0 to ${count - 1}. Return ONLY valid JSON (no markdown):
{ "matches": [ { "index": 0, "reason": "..." } ], "reasoning": "what the product is and the rule applied" }
If none match, return "matches": [].`;
}

function buildSelectPrompt(p: ProductInput, count: number, maxImages: number): string {
  return `You are selecting the final e-commerce images for a cycling product listing.

${identityLines(p)}

STEP 1 — CONSENSUS PRODUCT: look across ALL images and find the exact product/model/configuration the
MAJORITY agree on (same body shape, design, colour, branding). Treat a visibly different image (different
model/colour, a bundle/set, an accessory) as the WRONG product — reject it, and NEVER make an outlier the
primary. If images split between two products, keep the group matching the name/brand and discard the other.

STEP 2 — PRIMARY (must come from the consensus group): a HERO PACKSHOT — the physical product (or its
front-of-pack packaging) as the main subject on a clean white/neutral background, front view, well-lit,
high resolution, no people/lifestyle. NEVER pick an information panel as the primary (nutrition/ingredient
tables, spec sheets, sizing charts, feature infographics, back-of-pack, or any image that is mostly
text/numbers) — those may only be supporting images.

STEP 3 — SUPPORTING (also from the consensus group): different angles/detail shots of the SAME product and
SAME configuration. Spec/ingredient/back-of-pack panels are allowed here. No near-identical duplicates,
no watermarks/collages.

GOAL: ${TARGET_MIN}-${maxImages} images total — ONE primary plus the rest, ALL the consensus product.
CONSISTENCY (overrides the goal): every selected image must be the SAME product and configuration; reject
bundles/sets/different colours if the listing is a single item; correctness beats quantity.

Images are numbered 0 to ${count - 1}. Return ONLY valid JSON (no markdown):
{ "selectedImages": [ { "index": 0, "isPrimary": true, "reason": "..." } ], "reasoning": "..." }`;
}

function toImageContent(cands: AnalyzedCandidate[], detail: "low" | "high") {
  return cands.map((c) => ({
    type: "image_url" as const,
    image_url: { url: c.thumbnailUrl || c.url, detail },
  }));
}

async function visionJSON<T>(
  prompt: string,
  cands: AnalyzedCandidate[],
  detail: "low" | "high",
  model: string,
): Promise<{ result: T; usage: TokenUsage }> {
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    max_completion_tokens: 1400,
    response_format: { type: "json_object" },
    messages: [
      { role: "user", content: [{ type: "text", text: prompt }, ...toImageContent(cands, detail)] },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("AI returned no content");
  const usage: TokenUsage = {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    cachedTokens:
      (completion.usage as { prompt_tokens_details?: { cached_tokens?: number } })
        ?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
  return { result: JSON.parse(raw) as T, usage };
}

/** Programmatic "is this a good hero packshot" score, 0–1. */
function heroScoreOf(c: AnalyzedCandidate): number {
  const resolution = Math.min(c.megapixels / 2, 1);
  const squareness = 1 - Math.min(Math.abs(c.aspectRatio - 1), 1);
  return (
    c.whiteFraction * 0.4 + resolution * 0.25 + (c.isOfficial ? 1 : 0) * 0.2 + squareness * 0.15
  );
}

export interface AiSelectResult {
  selected: SelectedImage[];
  primaryUrl: string | null;
  reasoning: string;
  modelsUsed: string[];
  costUsd: number;
  sentToAi: number;
}

export async function aiSelect(
  pool: AnalyzedCandidate[],
  product: ProductInput,
): Promise<AiSelectResult> {
  for (const c of pool) c.heroScore = heroScoreOf(c);

  const maxImages = Math.min(Math.max(product.maxImages, 1), 6);
  const modelsUsed = new Set<string>();
  let usage: TokenUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
  const addUsage = (u: TokenUsage) => {
    usage = {
      promptTokens: usage.promptTokens + u.promptTokens,
      cachedTokens: usage.cachedTokens + u.cachedTokens,
      completionTokens: usage.completionTokens + u.completionTokens,
    };
  };

  // ── Stage A: triage (only when the pool is bigger than we'd deep-analyse) ──
  let shortlist = pool;
  let triageReasoning = "";
  if (pool.length > SHORTLIST_MAX) {
    try {
      const { result, usage: u } = await visionJSON<TriageResult>(
        buildTriagePrompt(product, pool.length),
        pool,
        "low",
        TRIAGE_MODEL,
      );
      modelsUsed.add(TRIAGE_MODEL);
      addUsage(u);
      triageReasoning = result.reasoning ?? "";
      const idxs = (result.matches ?? [])
        .map((m) => m.index)
        .filter((i) => Number.isInteger(i) && i >= 0 && i < pool.length);
      shortlist =
        idxs.length > 0
          ? Array.from(new Set(idxs)).slice(0, SHORTLIST_MAX).map((i) => pool[i])
          : pool.slice(0, SHORTLIST_MAX);
    } catch {
      shortlist = pool.slice(0, SHORTLIST_MAX);
    }
    // Re-index for the select stage.
    shortlist = shortlist.map((c, i) => ({ ...c, index: i }));
  }

  // ── Stage B: deep selection (fast model first, escalate if it under-delivers) ──
  let select: SelectResult | undefined;
  let selections: SelectResult["selectedImages"] = [];
  let lastErr: string | undefined;
  for (const model of [SELECT_FAST_MODEL, SELECT_FULL_MODEL]) {
    try {
      const { result, usage: u } = await visionJSON<SelectResult>(
        buildSelectPrompt(product, shortlist.length, maxImages),
        shortlist,
        "high",
        model,
      );
      modelsUsed.add(model);
      addUsage(u);
      select = result;
      const valid = (result.selectedImages ?? []).filter(
        (s) => Number.isInteger(s.index) && s.index >= 0 && s.index < shortlist.length,
      );
      if (valid.length > 0 || selections.length === 0) selections = valid;
      if (selections.length >= TARGET_MIN || shortlist.length < TARGET_MIN) break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "selection failed";
    }
  }

  const costUsd =
    (usage.promptTokens - usage.cachedTokens) * INPUT_COST +
    usage.cachedTokens * CACHED_COST +
    usage.completionTokens * OUTPUT_COST;

  if (selections.length === 0) {
    return {
      selected: [],
      primaryUrl: null,
      reasoning: lastErr ? `Selection failed: ${lastErr}` : select?.reasoning ?? "No usable image",
      modelsUsed: [...modelsUsed],
      costUsd,
      sentToAi: shortlist.length,
    };
  }

  // Resolve the primary: prefer the model's flag, else the best hero score.
  let primaryIndex = selections.find((s) => s.isPrimary)?.index;
  if (primaryIndex === undefined) {
    primaryIndex = [...selections].sort(
      (a, b) => shortlist[b.index].heroScore - shortlist[a.index].heroScore,
    )[0].index;
  }

  // Guard: never let an info-panel be the hero if a clean packshot is available.
  const reasonOf = (i: number) => selections.find((s) => s.index === i)?.reason ?? "";
  if (INFO_PANEL_RE.test(reasonOf(primaryIndex))) {
    const clean = [...selections]
      .filter((s) => s.index !== primaryIndex && !INFO_PANEL_RE.test(s.reason ?? ""))
      .sort((a, b) => shortlist[b.index].heroScore - shortlist[a.index].heroScore)[0];
    if (clean) primaryIndex = clean.index;
  }

  // Final tiebreak: if the chosen hero has a weak background but another
  // selected packshot is markedly cleaner, prefer the cleaner one.
  const primaryCand = shortlist[primaryIndex];
  if (primaryCand.whiteFraction < 0.35) {
    const cleaner = [...selections]
      .filter((s) => s.index !== primaryIndex && !INFO_PANEL_RE.test(s.reason ?? ""))
      .map((s) => shortlist[s.index])
      .sort((a, b) => b.heroScore - a.heroScore)[0];
    if (cleaner && cleaner.heroScore - primaryCand.heroScore > 0.25) {
      primaryIndex = cleaner.index;
    }
  }

  const orderedIdx = [
    primaryIndex,
    ...selections.map((s) => s.index).filter((i) => i !== primaryIndex),
  ].slice(0, maxImages);

  const selected: SelectedImage[] = orderedIdx.map((i) => {
    const c = shortlist[i];
    return {
      url: c.url,
      thumbnailUrl: c.thumbnailUrl,
      domain: c.domain,
      isPrimary: i === primaryIndex,
      reason: reasonOf(i),
      width: c.width,
      height: c.height,
      whiteFraction: c.whiteFraction,
      isOfficial: c.isOfficial,
      heroScore: c.heroScore,
    };
  });

  return {
    selected,
    primaryUrl: shortlist[primaryIndex].url,
    reasoning: [triageReasoning, select?.reasoning].filter(Boolean).join(" — "),
    modelsUsed: [...modelsUsed],
    costUsd,
    sentToAi: shortlist.length,
  };
}
