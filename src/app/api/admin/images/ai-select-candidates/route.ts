/**
 * AI Candidate Selection API
 * POST /api/admin/images/ai-select-candidates
 *
 * Two-stage funnel over Serper image candidates:
 *   Stage 1 (triage):  cheap low-detail pass over a wide pool — keep only images that
 *                      show the EXACT product/configuration, producing a shortlist.
 *   Stage 2 (select):  high-detail pass over the shortlist — pick one primary image
 *                      plus up to 4 supporting images of the same product.
 * Returns the chosen URLs so the caller can approve them via
 * /api/admin/images/approve-candidates.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Candidate {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  domain?: string;
  width?: number;
  height?: number;
}

interface TriageResult {
  matches: Array<{ index: number; reason: string }>;
  reasoning: string;
}

interface SelectResult {
  selectedImages: Array<{ index: number; isPrimary: boolean; reason: string }>;
  reasoning: string;
}

// Stage 1 triages up to this many candidates; Stage 2 deep-analyses up to SHORTLIST_MAX.
// Shortlist is kept wider than the final target so Stage 2 has enough valid same-product
// images to reach 3-6 selections.
const TRIAGE_POOL = 40;
const SHORTLIST_MAX = 15;
const TARGET_MIN = 3;
const TRIAGE_MODEL = 'gpt-5.4-mini';
const SELECT_FAST_MODEL = 'gpt-5.4-mini';
const SELECT_FULL_MODEL = 'gpt-5.4';

function identityLines(productName: string, brand?: string, upc?: string) {
  return [
    `Product name: "${productName}"`,
    brand ? `Brand: "${brand}"` : null,
    upc ? `UPC/barcode: "${upc}"` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTriagePrompt(productName: string, count: number, brand?: string, upc?: string) {
  return `You are screening web-search image results for a cycling e-commerce listing.
You are given ${count} candidate images. Many are the WRONG product, a different variant, a bundle,
or an accessory. Your only job in this step is to KEEP the ones that show the EXACT product below and
DISCARD everything else.

${identityLines(productName, brand, upc)}

First, work out exactly what the listing sells. Pay close attention to qualifiers in the name such as
"front" vs "rear" vs "set/pair/combo", colour, size, capacity (lumens, mAh, ml), wheel size, model year,
and edition. The product name is the source of truth.

Then KEEP an image only if it clearly shows that exact product and configuration. In particular:
   - If the listing is a single item (e.g. a FRONT light), DISCARD images showing a bundle/set
     (e.g. front + rear together), a different variant, a different colour, or different accessories.
   - DISCARD a different model, a similar-but-different product, generic category shots, collages,
     heavy watermarks/text, and lifestyle shots where the product is not clearly the subject.
   - When unsure whether it is the same product, DISCARD it. Recall is fine to sacrifice for correctness.

Images are numbered 0 to ${count - 1}.

Return ONLY valid JSON (no markdown):
{
  "matches": [
    { "index": 0, "reason": "Single front light, matches name and brand" },
    { "index": 4, "reason": "Same front light, packaging shot" }
  ],
  "reasoning": "What the exact product is and the rule you applied to keep/discard"
}
If none match, return "matches": [].`;
}

function buildSelectPrompt(productName: string, count: number, maxImages: number, brand?: string, upc?: string) {
  return `You are selecting the final e-commerce images for a cycling product listing.
These ${count} images have already been screened to (mostly) match the product, but double-check
consistency and drop any that slipped through.

${identityLines(productName, brand, upc)}

STEP 1 — FIND THE CONSENSUS PRODUCT (do this before anything else):
Look across ALL the images and work out which exact product/model/configuration the MAJORITY of them
agree on — same body shape, lens/head design, button layout, mount, colour, and branding. That majority
is the "consensus product"; it is almost certainly the correct listing.
   - An image that looks visibly DIFFERENT from the majority (different head/lens shape, different model,
     different colour, a bundle/set, an accessory) is most likely the WRONG product. Treat the odd one
     out as a reject, NOT as a candidate — and NEVER make an outlier the primary.
   - If the images split roughly evenly between two different-looking products, pick the group that best
     matches the product name/brand above and discard the other group entirely.

STEP 2 — PICK THE PRIMARY (must come FROM the consensus group):
   The primary must be a HERO PACKSHOT: a photo of the physical product itself — the item or its
   front-of-pack packaging — shown as the main subject on a clean white/neutral background, front view,
   well-lit, high resolution, no people/lifestyle.
   CRITICAL — the primary must NOT be an information panel. Even when they have clean backgrounds, the
   following are NEVER acceptable as the primary (rank them last for the primary slot):
     - nutrition-facts / supplement-facts tables
     - ingredient lists or "directions / how to use" text
     - spec sheets, sizing charts, feature/benefit infographics, callout diagrams
     - the BACK of packaging, or any image that is mostly text/numbers rather than the product
   If an image is dominated by text or a facts table, it is an information panel, not a packshot — keep
   it only as a SUPPORTING image, never the primary.
   Prefer, in order: (1) clean front-of-pack hero packshot, (2) clear photo of the product/packaging at a
   slight angle, (3) anything else. Aesthetics only decide ties between two genuine packshots. Matching
   the majority/product identity always wins over photo quality.

STEP 3 — ADD SUPPORTING IMAGES (also from the consensus group):
   - Different angles or detail shots of the SAME product and SAME configuration as the primary.
   - Nutrition/ingredient/spec/back-of-pack panels ARE allowed here (they are useful supporting info),
     just never as the primary.
   - Professional quality, prefer variety of angles, no near-identical duplicates, no watermarks/collages.

GOAL: aim for ${TARGET_MIN}-${maxImages} images total — ONE primary plus ${TARGET_MIN - 1}-${maxImages - 1}
additional images, ALL from the consensus group. Include EVERY consensus-group image that clearly shows
the same product up to ${maxImages}; a rich gallery is the goal, but only of the consensus product.

CONSISTENCY RULES (these override the goal — never break them):
   - EVERY selected image (primary included) must depict the SAME product and SAME configuration.
   - If the listing is a single item, REJECT any bundle/set, different variant, different colour,
     or different-accessory image.
   - Correctness beats quantity: only return fewer than ${TARGET_MIN} images if there genuinely are not
     enough correct same-product images. NEVER pad the count with wrong-product images.

Images are numbered 0 to ${count - 1}.

Return ONLY valid JSON (no markdown):
{
  "selectedImages": [
    { "index": 0, "isPrimary": true, "reason": "Front-of-pack hero packshot of the product on white bg" },
    { "index": 2, "isPrimary": false, "reason": "Same product, angled detail shot" },
    { "index": 5, "isPrimary": false, "reason": "Nutrition-facts panel — supporting info only, not primary" }
  ],
  "reasoning": "What the exact product is and why these images match it"
}`;
}

// GPT-5.4 pricing (per 1M tokens) — verify against platform.openai.com/docs/models
const GPT4O_INPUT_COST  = 10.00 / 1_000_000;
const GPT4O_CACHED_COST =  2.50 / 1_000_000; // 75 % off when cached
const GPT4O_OUTPUT_COST = 40.00 / 1_000_000;

interface TokenUsage {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens:    a.promptTokens    + b.promptTokens,
    cachedTokens:    a.cachedTokens    + b.cachedTokens,
    completionTokens: a.completionTokens + b.completionTokens,
  };
}

function calcCost(u: TokenUsage): number {
  const uncachedInput = u.promptTokens - u.cachedTokens;
  return uncachedInput * GPT4O_INPUT_COST
    + u.cachedTokens * GPT4O_CACHED_COST
    + u.completionTokens * GPT4O_OUTPUT_COST;
}

function toImageContent(cands: Candidate[], detail: 'low' | 'high') {
  return cands.map((candidate) => ({
    type: 'image_url' as const,
    image_url: { url: candidate.thumbnailUrl || candidate.url, detail },
  }));
}

async function visionJSON<T>(
  prompt: string,
  cands: Candidate[],
  detail: 'low' | 'high',
  model: string,
): Promise<{ result: T; usage: TokenUsage }> {
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    max_completion_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...toImageContent(cands, detail)],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('AI returned no content');
  const usage: TokenUsage = {
    promptTokens:    completion.usage?.prompt_tokens     ?? 0,
    cachedTokens:    (completion.usage as { prompt_tokens_details?: { cached_tokens?: number } })
                       ?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
  return { result: JSON.parse(raw) as T, usage };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const body = await request.json();
    const productName = (body.productName as string | undefined)?.trim();
    const brand = (body.brand as string | undefined)?.trim() || undefined;
    const upc = (body.upc as string | undefined)?.trim() || undefined;
    const candidates = (body.candidates || []) as Candidate[];
    const maxImages = Math.min(Math.max(Number(body.maxImages) || 6, 1), 6);

    if (!productName) {
      return NextResponse.json({ error: 'productName is required' }, { status: 400 });
    }
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No candidates supplied' }, { status: 400 });
    }

    const pool = candidates.slice(0, TRIAGE_POOL);
    let triageReasoning = '';
    let totalUsage: TokenUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
    const modelsUsed = new Set<string>();

    // ── Stage 1: triage (skip if the pool is already small enough to deep-analyse) ──
    let shortlist: Candidate[] = pool;
    if (pool.length > SHORTLIST_MAX) {
      let triage: TriageResult;
      try {
        const { result, usage } = await visionJSON<TriageResult>(
          buildTriagePrompt(productName, pool.length, brand, upc),
          pool,
          'low',
          TRIAGE_MODEL,
        );
        modelsUsed.add(TRIAGE_MODEL);
        triage = result;
        totalUsage = addUsage(totalUsage, usage);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? `Triage failed: ${error.message}` : 'Triage failed' },
          { status: 502 },
        );
      }

      triageReasoning = triage.reasoning || '';
      const matchIndexes = (triage.matches || [])
        .map((m) => m.index)
        .filter((i) => Number.isInteger(i) && i >= 0 && i < pool.length);

      if (matchIndexes.length === 0) {
        shortlist = pool.slice(0, SHORTLIST_MAX);
        triageReasoning = `${triageReasoning} (No confident matches in triage; deferring to final review.)`.trim();
      } else {
        const seen = new Set<number>();
        shortlist = matchIndexes
          .filter((i) => (seen.has(i) ? false : (seen.add(i), true)))
          .slice(0, SHORTLIST_MAX)
          .map((i) => pool[i]);
      }
    }

    // ── Stage 2: deep selection over the shortlist ──
    let select: SelectResult | undefined;
    let selections: SelectResult['selectedImages'] = [];
    let lastSelectError: string | undefined;
    const selectModels = [SELECT_FAST_MODEL, SELECT_FULL_MODEL];

    for (const selectModel of selectModels) {
      try {
        const { result, usage } = await visionJSON<SelectResult>(
          buildSelectPrompt(productName, shortlist.length, maxImages, brand, upc),
          shortlist,
          'high',
          selectModel,
        );
        modelsUsed.add(selectModel);
        select = result;
        totalUsage = addUsage(totalUsage, usage);
      } catch (error) {
        lastSelectError = error instanceof Error ? error.message : 'Selection failed';
        continue;
      }

      const candidateSelections = (select.selectedImages || []).filter(
        (s) => Number.isInteger(s.index) && s.index >= 0 && s.index < shortlist.length,
      );

      if (candidateSelections.length > 0 || selections.length === 0) {
        selections = candidateSelections;
      }

      if (selections.length >= TARGET_MIN || shortlist.length < TARGET_MIN) break;
    }

    if (selections.length === 0) {
      if (!select) {
        return NextResponse.json(
          { error: lastSelectError ? `Selection failed: ${lastSelectError}` : 'Selection failed' },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: 'AI did not select any usable image', reasoning: select.reasoning, stage: 'select' },
        { status: 422 },
      );
    }

    // Resolve a single primary: prefer the AI's flagged primary, else first selection.
    let primaryIndex = selections.find((s) => s.isPrimary)?.index;
    if (primaryIndex === undefined) primaryIndex = selections[0].index;

    // Safety net: a nutrition/ingredient/spec/back-of-pack panel must never be the primary.
    // The AI describes each pick in `reason`; if the chosen primary reads like an info panel and
    // another selection does NOT, promote that non-panel image instead.
    const INFO_PANEL_RE = /nutrition|ingredient|supplement\s*facts|\bfacts\b|spec(?:s|ification)?\b|sizing|directions|how to use|back[\s-]?of[\s-]?pack|\bpanel\b|infographic|label/i;
    const reasonOf = (idx: number) => selections.find((s) => s.index === idx)?.reason || '';
    if (INFO_PANEL_RE.test(reasonOf(primaryIndex))) {
      const cleanPick = selections.find(
        (s) => s.index !== primaryIndex && !INFO_PANEL_RE.test(s.reason || ''),
      );
      if (cleanPick) primaryIndex = cleanPick.index;
    }

    // De-dupe by index, cap at maxImages, ensure primary is first.
    const orderedIndexes = [
      primaryIndex,
      ...selections.map((s) => s.index).filter((i) => i !== primaryIndex),
    ].slice(0, maxImages);

    const selectedCandidates = orderedIndexes.map((i) => shortlist[i]);
    const primaryUrl = shortlist[primaryIndex].url;
    const reasonByIndex = new Map(selections.map((s) => [s.index, s.reason]));
    const costUsd = calcCost(totalUsage);

    return NextResponse.json({
      success: true,
      primaryUrl,
      selectedCandidates,
      selectedUrls: selectedCandidates.map((c) => c.url),
      reasoning: [triageReasoning, select?.reasoning].filter(Boolean).join(' — '),
      stages: { triagePool: pool.length, shortlist: shortlist.length },
      modelsUsed: [...modelsUsed],
      perImageReasons: orderedIndexes.map((i) => ({
        url: shortlist[i].url,
        isPrimary: i === primaryIndex,
        reason: reasonByIndex.get(i) || '',
      })),
      costUsd,
      tokenUsage: totalUsage,
    });
  } catch (error) {
    console.error('[AI SELECT CANDIDATES] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI selection failed' },
      { status: 500 },
    );
  }
}
