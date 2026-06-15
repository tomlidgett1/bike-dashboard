/**
 * Shared types for the "Smart product photos" pipeline.
 *
 * This is a more advanced replacement for the catalogue image flow
 * (single Serper query → raw pool → AI pick). It harvests a richer pool,
 * downloads each image to measure true quality with `sharp`, collapses
 * zoomed/cropped duplicates with perceptual hashing, then runs a clean
 * two-stage AI pass and locks a hero.
 */

export interface ProductInput {
  /** What the listing actually sells — the source of truth for matching. */
  name: string;
  brand?: string | null;
  upc?: string | null;
  /** Optional pre-built search query (e.g. canonical image_review_search_query). */
  searchQuery?: string | null;
  /** How many images the user wants back (1–6). */
  maxImages: number;
}

/** A raw image hit straight off Serper, before any analysis. */
export interface RawHit {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  source?: string;
  domain?: string;
  /** Serper-reported dimensions — often missing or wrong; we re-measure. */
  reportedWidth?: number;
  reportedHeight?: number;
  /** Which harvest query surfaced this hit (for debugging the pool). */
  query?: string;
}

/** Why a candidate was dropped before reaching the AI. */
export type RejectReason =
  | "dead_link"
  | "not_image"
  | "too_small"
  | "bad_aspect"
  | "duplicate"
  | "decode_failed";

/** A hit after we have downloaded it and measured real signals. */
export interface AnalyzedCandidate {
  index: number;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  domain?: string;
  source?: string;
  query?: string;

  /** True pixel dimensions read from the image bytes. */
  width: number;
  height: number;
  megapixels: number;
  aspectRatio: number;

  /** 64-bit perceptual (difference) hash of the full frame, hex string. */
  dhash: string;
  /** dHash of a centre crop — lets us catch zoomed-in copies of the same shot. */
  dhashCenter: string;
  /** Fraction of border pixels that are near-white (clean-packshot signal). */
  whiteFraction: number;
  /** Mean luminance 0–255. */
  brightness: number;

  /** Came from a recognised official brand / manufacturer domain. */
  isOfficial: boolean;

  /** 0–1 heuristic score for "good hero packshot", set during ranking. */
  heroScore: number;
}

export interface RejectedCandidate {
  url: string;
  domain?: string;
  reason: RejectReason;
  detail?: string;
  /** For duplicates: the url of the representative it collapsed into. */
  duplicateOf?: string;
}

export interface SelectedImage {
  url: string;
  thumbnailUrl?: string;
  domain?: string;
  isPrimary: boolean;
  /** AI's reason for selecting it. */
  reason: string;
  width: number;
  height: number;
  whiteFraction: number;
  isOfficial: boolean;
  heroScore: number;
}

export interface PipelineStageStats {
  harvested: number;
  afterPrefilter: number;
  analyzed: number;
  afterDedupe: number;
  sentToAi: number;
  selected: number;
}

export interface PipelineTimings {
  harvestMs: number;
  analyzeMs: number;
  dedupeMs: number;
  aiMs: number;
  totalMs: number;
}

export interface HeroPipelineResult {
  ok: boolean;
  error?: string;

  primaryUrl: string | null;
  selected: SelectedImage[];

  reasoning: string;
  queriesUsed: string[];
  stats: PipelineStageStats;
  timings: PipelineTimings;

  /** Transparency: what got thrown away and why. */
  rejected: RejectedCandidate[];

  /** Diagnostics for the AI stage. */
  modelsUsed: string[];
  costUsd: number;
}
