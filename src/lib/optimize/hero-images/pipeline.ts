/**
 * Orchestrates the full "Smart product photos" pipeline:
 *
 *   harvest (multi-query Serper, incl. official sites)
 *     → analyze (download + sharp: true dims, pHash, whiteness; drop junk)
 *       → dedupe (collapse zoom/crop/resolution duplicates)
 *         → aiSelect (triage + select on a clean pool, then lock a hero)
 *
 * Returns a rich result including the per-stage funnel and every rejected
 * image with a reason, so the UI can SHOW why the output can be trusted.
 */

import { harvestSerperImages, type SerperSearch } from "./harvest";
import { analyzeCandidates } from "./analyze";
import { dedupeCandidates } from "./dedupe";
import { aiSelect } from "./ai-select";
import type { HeroPipelineResult, ProductInput, RejectedCandidate } from "./types";

export interface RunPipelineDeps {
  serperSearch: SerperSearch;
}

export async function runHeroImagePipeline(
  product: ProductInput,
  deps: RunPipelineDeps,
): Promise<HeroPipelineResult> {
  const t0 = Date.now();

  // ── Stage 1: harvest ──
  const { hits, queriesUsed } = await harvestSerperImages(product, deps.serperSearch);
  const tHarvest = Date.now();

  if (hits.length === 0) {
    return emptyResult(product, queriesUsed, {
      harvested: 0,
      afterPrefilter: 0,
      analyzed: 0,
      afterDedupe: 0,
      sentToAi: 0,
      selected: 0,
    }, [], "No images found for this product. Try a more specific name, brand, or UPC.", {
      harvestMs: tHarvest - t0,
      analyzeMs: 0,
      dedupeMs: 0,
      aiMs: 0,
      totalMs: Date.now() - t0,
    });
  }

  // ── Stage 2: download + measure ──
  const { analyzed, rejected: analysisRejects } = await analyzeCandidates(hits, product);
  const tAnalyze = Date.now();

  // ── Stage 3: perceptual de-dup ──
  const { kept, duplicates } = dedupeCandidates(analyzed);
  const tDedupe = Date.now();

  const allRejected: RejectedCandidate[] = [...analysisRejects, ...duplicates];

  if (kept.length === 0) {
    return emptyResult(product, queriesUsed, {
      harvested: hits.length,
      afterPrefilter: analyzed.length,
      analyzed: analyzed.length,
      afterDedupe: 0,
      sentToAi: 0,
      selected: 0,
    }, allRejected, "Every candidate was a dead link, too small, or a duplicate.", {
      harvestMs: tHarvest - t0,
      analyzeMs: tAnalyze - tHarvest,
      dedupeMs: tDedupe - tAnalyze,
      aiMs: 0,
      totalMs: Date.now() - t0,
    });
  }

  // ── Stage 4: AI select + hero lock ──
  const ai = await aiSelect(kept, product);
  const tAi = Date.now();

  return {
    ok: ai.selected.length > 0,
    error: ai.selected.length > 0 ? undefined : ai.reasoning,
    primaryUrl: ai.primaryUrl,
    selected: ai.selected,
    reasoning: ai.reasoning,
    queriesUsed,
    stats: {
      harvested: hits.length,
      afterPrefilter: analyzed.length,
      analyzed: analyzed.length,
      afterDedupe: kept.length,
      sentToAi: ai.sentToAi,
      selected: ai.selected.length,
    },
    timings: {
      harvestMs: tHarvest - t0,
      analyzeMs: tAnalyze - tHarvest,
      dedupeMs: tDedupe - tAnalyze,
      aiMs: tAi - tDedupe,
      totalMs: Date.now() - t0,
    },
    rejected: allRejected,
    modelsUsed: ai.modelsUsed,
    costUsd: ai.costUsd,
  };
}

function emptyResult(
  _product: ProductInput,
  queriesUsed: string[],
  stats: HeroPipelineResult["stats"],
  rejected: RejectedCandidate[],
  error: string,
  timings: HeroPipelineResult["timings"],
): HeroPipelineResult {
  return {
    ok: false,
    error,
    primaryUrl: null,
    selected: [],
    reasoning: "",
    queriesUsed,
    stats,
    timings,
    rejected,
    modelsUsed: [],
    costUsd: 0,
  };
}
