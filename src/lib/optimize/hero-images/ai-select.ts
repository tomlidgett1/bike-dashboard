/**
 * Stage 4 — AI triage + select, then hero lock + verification.
 *
 * Three upgrades over the old catalogue selector:
 *   1. GROUNDING — every candidate is shown to the model WITH its web title and
 *      source domain (and whether the domain is official). Titles usually name
 *      the exact model/variant, so the model stops guessing from pixels alone.
 *   2. IDENTITY-AWARE — the prompt lists the product's declared variant
 *      attributes (colour / size / year / capacity) so a sibling model or wrong
 *      colourway is rejected, not "consensus'd" in.
 *   3. VERIFICATION — after a hero is chosen it is independently re-checked
 *      against the identity with a confidence score; a low-confidence hero is
 *      swapped for the next-best clean packshot. This is the "confirm the hero
 *      matches the product" guarantee.
 */

import OpenAI from "openai";
import type { ProductIdentity } from "./identity";
import type { AnalyzedCandidate, ProductInput, SelectedImage } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TRIAGE_MODEL = "gpt-5.4-mini";
const SELECT_FAST_MODEL = "gpt-5.4-mini";
const SELECT_FULL_MODEL = "gpt-5.4";
const VERIFY_MODEL = "gpt-5.4";

const SHORTLIST_MAX = 14;
const TARGET_MIN = 2;
/** Below this, the hero is treated as unverified and we try an alternative. */
const VERIFY_THRESHOLD = 0.62;
/** Cap verification calls so bulk runs stay bounded. */
const MAX_VERIFY_ATTEMPTS = 3;

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
interface VerifyResult {
  match: boolean;
  confidence: number;
  mismatches: string[];
  reasoning: string;
}
interface TokenUsage {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
}

function identityLines(identity: ProductIdentity): string {
  const a = identity.attributes;
  const attrs: string[] = [];
  if (a.colors.length) attrs.push(`colour: ${a.colors.join("/")}`);
  if (a.sizes.length) attrs.push(`size: ${a.sizes.join("/")}`);
  if (a.year) attrs.push(`model year: ${a.year}`);
  if (a.capacities.length) attrs.push(`capacity/spec: ${a.capacities.join(", ")}`);

  return [
    `Product name: "${identity.name}"`,
    identity.brand ? `Brand: "${identity.brand}"` : null,
    identity.upc ? `UPC/barcode: "${identity.upc}"` : null,
    attrs.length ? `Declared variant attributes — ${attrs.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTriagePrompt(identity: ProductIdentity, count: number): string {
  return `You are screening web-search image results for a cycling e-commerce listing.
You are given ${count} candidate images, each preceded by its web title and source domain.
Many are the WRONG product, a different variant, a bundle, or an accessory. Your only job here
is to KEEP the ones that show the EXACT product below and DISCARD everything else.

${identityLines(identity)}

Use BOTH the image and the title text. Pay close attention to qualifiers: "front" vs "rear" vs
"set/pair/combo", colour, size, capacity (lumens, mAh, ml), wheel size, model year, and edition.
The product name + declared attributes are the source of truth. DISCARD a different model, a
similar-but-different product, generic category shots, collages, heavy watermarks, and lifestyle
shots where the product is not clearly the subject. When unsure, DISCARD.

Images are numbered 0 to ${count - 1}. Return ONLY valid JSON (no markdown):
{ "matches": [ { "index": 0, "reason": "..." } ], "reasoning": "what the product is and the rule applied" }
If none match, return "matches": [].`;
}

function buildSelectPrompt(identity: ProductIdentity, count: number, maxImages: number): string {
  return `You are selecting the final e-commerce images for a cycling product listing.
Each candidate image is preceded by its web title and source domain (some marked OFFICIAL =
the brand's own site, which should be trusted most).

${identityLines(identity)}

STEP 1 — CONFIRM THE PRODUCT: find the images that are THIS exact product/model/configuration,
matching the declared variant attributes above where given. Prefer OFFICIAL sources and titles
that name the exact model. Treat a visibly different image (different model/colour, a bundle/set,
an accessory) as the WRONG product — reject it, and NEVER make an outlier the primary. Do NOT pick
a more popular sibling model just because more results show it; correctness beats popularity.

STEP 2 — PRIMARY (must be the confirmed product): a HERO PACKSHOT — the physical product (or its
front-of-pack packaging) as the main subject on a clean white/neutral background, front view,
well-lit, high resolution, no people/lifestyle. NEVER pick an information panel as the primary
(nutrition/ingredient tables, spec sheets, sizing charts, feature infographics, back-of-pack, or
any image that is mostly text/numbers) — those may only be supporting images.

STEP 3 — SUPPORTING (also the confirmed product, same configuration): different angles/detail
shots. Spec/ingredient/back-of-pack panels are allowed here. No near-identical duplicates,
no watermarks/collages.

GOAL: ${TARGET_MIN}-${maxImages} images total — ONE primary plus the rest, ALL the confirmed product.
CONSISTENCY (overrides the goal): every selected image must be the SAME product and configuration;
reject bundles/sets/different colours if the listing is a single item; correctness beats quantity.

Images are numbered 0 to ${count - 1}. Return ONLY valid JSON (no markdown):
{ "selectedImages": [ { "index": 0, "isPrimary": true, "reason": "..." } ], "reasoning": "..." }`;
}

function buildVerifyPrompt(identity: ProductIdentity): string {
  return `You are the final verifier for ONE chosen hero image on an e-commerce listing.
Look ONLY at the image below and decide whether it is THE EXACT product described.

${identityLines(identity)}

Be strict and literal:
- A different model, generation, or sibling product is NOT a match.
- Where a colour/size/year/capacity is declared above, it MUST match the image; a different
  colourway or variant is NOT a match.
- A bundle/set/accessory when the listing is a single item is NOT a match.
- An information panel (mostly text/specs/nutrition) is NOT a valid hero.

Return ONLY valid JSON (no markdown):
{ "match": true|false, "confidence": 0.0-1.0, "mismatches": ["colour: listing red, image blue"], "reasoning": "..." }
confidence = your probability that this is the exact product AND a valid hero packshot.`;
}

/** Grounded content: each image preceded by a label with its title/source. */
function toGroundedContent(cands: AnalyzedCandidate[], detail: "low" | "high") {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } }
  > = [];
  cands.forEach((c, i) => {
    const title = (c.title ?? "").slice(0, 140).replace(/\s+/g, " ").trim();
    const label =
      `Image ${i}: ` +
      `title="${title || "(none)"}" · source=${c.domain ?? "unknown"}` +
      (c.isOfficial ? " · OFFICIAL" : "");
    parts.push({ type: "text", text: label });
    parts.push({ type: "image_url", image_url: { url: c.thumbnailUrl || c.url, detail } });
  });
  return parts;
}

function emptyUsage(c: OpenAI.Chat.Completions.ChatCompletion): TokenUsage {
  return {
    promptTokens: c.usage?.prompt_tokens ?? 0,
    cachedTokens:
      (c.usage as { prompt_tokens_details?: { cached_tokens?: number } })?.prompt_tokens_details
        ?.cached_tokens ?? 0,
    completionTokens: c.usage?.completion_tokens ?? 0,
  };
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
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...toGroundedContent(cands, detail)],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("AI returned no content");
  return { result: JSON.parse(raw) as T, usage: emptyUsage(completion) };
}

/** Programmatic "is this a good hero packshot for THIS product" score, 0–1. */
function heroScoreOf(c: AnalyzedCandidate): number {
  const resolution = Math.min(c.megapixels / 2, 1);
  const squareness = 1 - Math.min(Math.abs(c.aspectRatio - 1), 1);
  return (
    c.textScore * 0.2 +
    c.sourceScore * 0.1 +
    c.whiteFraction * 0.28 +
    resolution * 0.17 +
    (c.isOfficial ? 1 : 0) * 0.15 +
    squareness * 0.1
  );
}

/** Independently confirm a single hero candidate matches the product. */
async function verifyHero(
  candidate: AnalyzedCandidate,
  identity: ProductIdentity,
  onUsage: (u: TokenUsage) => void,
): Promise<VerifyResult> {
  const completion = await openai.chat.completions.create({
    model: VERIFY_MODEL,
    temperature: 0,
    max_completion_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildVerifyPrompt(identity) },
          {
            type: "image_url",
            image_url: { url: candidate.thumbnailUrl || candidate.url, detail: "high" },
          },
        ],
      },
    ],
  });
  onUsage(emptyUsage(completion));
  const raw = completion.choices[0]?.message?.content;
  const parsed = raw ? (JSON.parse(raw) as Partial<VerifyResult>) : {};
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
  return {
    match: Boolean(parsed.match),
    confidence,
    mismatches: Array.isArray(parsed.mismatches) ? parsed.mismatches.map(String) : [],
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}

export interface AiSelectResult {
  selected: SelectedImage[];
  primaryUrl: string | null;
  reasoning: string;
  modelsUsed: string[];
  costUsd: number;
  sentToAi: number;
  heroConfidence: number;
  heroVerified: boolean;
}

export async function aiSelect(
  pool: AnalyzedCandidate[],
  product: ProductInput,
  identity: ProductIdentity,
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
        buildTriagePrompt(identity, pool.length),
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
          ? Array.from(new Set(idxs))
              .slice(0, SHORTLIST_MAX)
              .map((i) => pool[i])
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
        buildSelectPrompt(identity, shortlist.length, maxImages),
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

  const finishCost = () =>
    (usage.promptTokens - usage.cachedTokens) * INPUT_COST +
    usage.cachedTokens * CACHED_COST +
    usage.completionTokens * OUTPUT_COST;

  if (selections.length === 0) {
    return {
      selected: [],
      primaryUrl: null,
      reasoning: lastErr ? `Selection failed: ${lastErr}` : select?.reasoning ?? "No usable image",
      modelsUsed: [...modelsUsed],
      costUsd: finishCost(),
      sentToAi: shortlist.length,
      heroConfidence: 0,
      heroVerified: false,
    };
  }

  // Resolve the initial primary: prefer the model's flag, else the best hero score.
  const reasonOf = (i: number) => selections.find((s) => s.index === i)?.reason ?? "";
  let primaryIndex = selections.find((s) => s.isPrimary)?.index;
  if (primaryIndex === undefined) {
    primaryIndex = [...selections].sort(
      (a, b) => shortlist[b.index].heroScore - shortlist[a.index].heroScore,
    )[0].index;
  }

  // Guard: never let an info-panel be the hero if a clean packshot is available.
  if (INFO_PANEL_RE.test(reasonOf(primaryIndex))) {
    const clean = [...selections]
      .filter((s) => s.index !== primaryIndex && !INFO_PANEL_RE.test(s.reason ?? ""))
      .sort((a, b) => shortlist[b.index].heroScore - shortlist[a.index].heroScore)[0];
    if (clean) primaryIndex = clean.index;
  }

  // ── Stage C: verification — confirm the hero, swap on low confidence ──
  // Candidate heroes = selected clean packshots, best-scored first, primary first.
  const heroOrder = Array.from(
    new Set([
      primaryIndex,
      ...selections
        .filter((s) => !INFO_PANEL_RE.test(s.reason ?? ""))
        .map((s) => s.index)
        .sort((a, b) => shortlist[b].heroScore - shortlist[a].heroScore),
    ]),
  );

  let bestVerify: { index: number; result: VerifyResult } | null = null;
  for (const idx of heroOrder.slice(0, MAX_VERIFY_ATTEMPTS)) {
    try {
      const result = await verifyHero(shortlist[idx], identity, addUsage);
      modelsUsed.add(VERIFY_MODEL);
      if (!bestVerify || result.confidence > bestVerify.result.confidence) {
        bestVerify = { index: idx, result };
      }
      if (result.match && result.confidence >= VERIFY_THRESHOLD) break;
    } catch {
      // Verification is best-effort; fall back to the heuristic primary.
    }
  }

  if (bestVerify) primaryIndex = bestVerify.index;
  const heroConfidence = bestVerify?.result.confidence ?? 0;
  const heroVerified = Boolean(
    bestVerify?.result.match && bestVerify.result.confidence >= VERIFY_THRESHOLD,
  );
  const mismatchNotes = bestVerify?.result.mismatches.length
    ? bestVerify.result.mismatches.join("; ")
    : undefined;

  const orderedIdx = [
    primaryIndex,
    ...selections.map((s) => s.index).filter((i) => i !== primaryIndex),
  ].slice(0, maxImages);

  const selected: SelectedImage[] = orderedIdx.map((i) => {
    const c = shortlist[i];
    const isPrimary = i === primaryIndex;
    return {
      url: c.url,
      thumbnailUrl: c.thumbnailUrl,
      domain: c.domain,
      isPrimary,
      reason: reasonOf(i),
      width: c.width,
      height: c.height,
      whiteFraction: c.whiteFraction,
      isOfficial: c.isOfficial,
      heroScore: c.heroScore,
      ...(isPrimary
        ? { verified: heroVerified, confidence: heroConfidence, mismatchNotes }
        : {}),
    };
  });

  return {
    selected,
    primaryUrl: shortlist[primaryIndex].url,
    reasoning: [triageReasoning, select?.reasoning, bestVerify?.result.reasoning]
      .filter(Boolean)
      .join(" — "),
    modelsUsed: [...modelsUsed],
    costUsd: finishCost(),
    sentToAi: shortlist.length,
    heroConfidence,
    heroVerified,
  };
}
