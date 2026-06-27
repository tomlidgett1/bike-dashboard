// ============================================================================
// Page scoring — the anti-spam heart of the agent.
//
// Positives: search_demand + local_intent + supply_depth + commercial_value
//            + ranking_gap + internal_link_potential + freshness
// Risks (subtracted): thin_content + cannibalisation + duplication + spam
//
// SUPPLY DEPTH is the dominant publishable signal, and GSC demand is a strong
// BONUS on top — so the inventory-driven factory publishes genuinely strong
// pages even before Google Search Console is connected, while pages with no real
// inventory can never clear the bar (thin_content_risk swamps them). That is how
// we avoid mass-producing doorway pages.
//
// Decision bands (0-100):
//   >= 70  publish + index   (real supply required)
//   52-69  draft, hold for review (noindex until promoted)
//   38-51  internal candidate only (noindex)
//   < 38   do nothing
//
// Worked examples (no GSC yet; local + commercial):
//   category × Melbourne, 20 listings → 72  publish
//   category × Melbourne, 10 listings → 72  publish
//   category × suburb,     8 listings → 66  review
//   bike-shops/melbourne,  3 stores   → 74  publish (store-backed)
//   suburb × category,     3 listings → 19  skip (thin → noindex)
//   + GSC (2k impressions, pos 9) on the 8-listing page → 94  publish
// ============================================================================
import type { ScoreSignals } from './seo-types.ts';

// Minimum real supply for a non-store page to be indexable (doc threshold:
// >= 5 live listings, OR an owned/partner store underpins it).
export const MIN_INDEXABLE_SUPPLY = 5;

export const PUBLISH_THRESHOLD = 70;
export const REVIEW_THRESHOLD = 52;
export const CANDIDATE_THRESHOLD = 38;

export interface ScoreResult {
  score: number;
  decision: 'publish' | 'review' | 'candidate' | 'skip';
  indexability: 'index' | 'noindex';
  spamRisk: number; // 0..100
  reasons: string[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// log-scaled demand so a handful of impressions doesn't read like 10k. Bonus.
function demandPoints(impressions: number): number {
  if (impressions <= 0) return 0;
  return clamp(Math.log10(impressions + 1) * 7, 0, 22);
}

function supplyPoints(supplyCount: number, storeBacked: boolean): number {
  const base = clamp(supplyCount * 2.6, 0, 26);
  // A real store underpins the page even with few listings → floor it.
  return storeBacked ? clamp(Math.max(base, 22) + 6, 0, 30) : base;
}

// Position 4-20 is the "money zone"; not-ranking-yet has modest upside.
function rankingGapPoints(position: number): number {
  if (position <= 0) return 6;
  if (position >= 4 && position <= 20) return 12;
  if (position > 20 && position <= 40) return 7;
  return 3;
}

export function scorePage(s: ScoreSignals): ScoreResult {
  const reasons: string[] = [];
  const hasRealSupply = s.supplyCount >= MIN_INDEXABLE_SUPPLY || s.storeBacked;

  // Positives ---------------------------------------------------------------
  const searchDemand = demandPoints(s.searchDemand);
  const localIntent = s.localIntent ? 18 : 0;
  const supplyDepth = supplyPoints(s.supplyCount, s.storeBacked);
  const commercialValue = s.commercialIntent ? 16 : 4;
  const rankingGap = rankingGapPoints(s.position);
  const internalLink = clamp(s.internalLinkPotential * 5, 0, 5);
  const freshness = 3;

  // Risks -------------------------------------------------------------------
  // Store-backed pages (directories / owned store) are never "thin" — a real
  // business underpins them even with a handful of stores. Only listing-backed
  // pages get the low-supply penalty.
  const thinContentRisk = !hasRealSupply ? 35 : s.storeBacked ? 0 : clamp(10 - s.supplyCount * 1.2, 0, 10);
  const cannibalisationRisk = clamp(s.cannibalisationRisk * 18, 0, 18);
  const duplicationRisk = clamp(s.duplicationRisk * 18, 0, 18);
  const spamRisk = clamp(
    (s.supplyCount === 0 ? 18 : 0) + s.duplicationRisk * 10 + (!s.localIntent && !s.commercialIntent ? 6 : 0),
    0,
    100,
  );

  const score = clamp(
    searchDemand + localIntent + supplyDepth + commercialValue + rankingGap + internalLink + freshness
      - thinContentRisk - cannibalisationRisk - duplicationRisk - spamRisk * 0.3,
    0,
    100,
  );

  if (!hasRealSupply) reasons.push(`thin: only ${s.supplyCount} live listings (need ${MIN_INDEXABLE_SUPPLY}+ or a store)`);
  else reasons.push(`backed by ${s.supplyCount} listings${s.storeBacked ? ' + store' : ''}`);
  if (s.cannibalisationRisk > 0.5) reasons.push('cannibalisation: an existing page already targets this keyword');
  if (s.duplicationRisk > 0.6) reasons.push('duplication: too similar to an existing page');
  if (s.localIntent) reasons.push('local intent');
  if (s.searchDemand > 0) reasons.push(`GSC demand: ${s.searchDemand} impressions, pos ${s.position || 'n/a'}`);

  let decision: ScoreResult['decision'];
  if (score >= PUBLISH_THRESHOLD && hasRealSupply) decision = 'publish';
  else if (score >= REVIEW_THRESHOLD) decision = 'review';
  else if (score >= CANDIDATE_THRESHOLD) decision = 'candidate';
  else decision = 'skip';

  // Hard gate: never index without real supply, regardless of score.
  const indexability: ScoreResult['indexability'] =
    decision === 'publish' && hasRealSupply ? 'index' : 'noindex';

  return { score: Math.round(score), decision, indexability, spamRisk: Math.round(spamRisk), reasons };
}
