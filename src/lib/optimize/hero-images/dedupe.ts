/**
 * Stage 3 — Perceptual de-duplication.
 *
 * The #1 manual-cleanup pain today is "it's a duplicate, just a different
 * zoom/crop/resolution". Serper happily returns the same product photo from
 * five retailers at five sizes. We cluster candidates by perceptual-hash
 * (dHash) Hamming distance and keep ONE representative per cluster — the
 * highest quality copy (resolution first, then a cleaner background, then an
 * official source). Everything else is recorded as a duplicate for the UI.
 */

import type { AnalyzedCandidate, RejectedCandidate } from "./types";

/** Max differing bits (out of 64) for two images to count as the same photo. */
const HAMMING_THRESHOLD = 10;

function popcount8(x: number): number {
  let count = 0;
  let v = x;
  while (v) {
    count += v & 1;
    v >>= 1;
  }
  return count;
}

/** Hamming distance between two 16-char (8-byte) hex dHashes, BigInt-free. */
function hammingDistance(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < a.length && i < b.length; i += 2) {
    const xa = parseInt(a.slice(i, i + 2), 16);
    const xb = parseInt(b.slice(i, i + 2), 16);
    dist += popcount8(xa ^ xb);
  }
  return dist;
}

/**
 * Two images are the "same photo" if their closest frame-to-frame match is
 * within threshold. Comparing full-frame AND centre-crop hashes both ways means
 * a zoomed-in copy (its full frame ≈ the other image's centre) is also caught,
 * not just identical re-uploads and rescales.
 */
function looksDuplicate(a: AnalyzedCandidate, b: AnalyzedCandidate): boolean {
  const best = Math.min(
    hammingDistance(a.dhash, b.dhash),
    hammingDistance(a.dhash, b.dhashCenter),
    hammingDistance(a.dhashCenter, b.dhash),
    hammingDistance(a.dhashCenter, b.dhashCenter),
  );
  return best <= HAMMING_THRESHOLD;
}

/** Higher is better — used to choose the representative kept from each cluster. */
function qualityRank(c: AnalyzedCandidate): number {
  return (
    c.megapixels * 10 +
    c.whiteFraction * 3 +
    (c.isOfficial ? 5 : 0)
  );
}

export interface DedupeResult {
  kept: AnalyzedCandidate[];
  duplicates: RejectedCandidate[];
}

export function dedupeCandidates(candidates: AnalyzedCandidate[]): DedupeResult {
  // Best copies first, so each new cluster is seeded by its strongest member.
  const ordered = [...candidates].sort((a, b) => qualityRank(b) - qualityRank(a));

  const reps: AnalyzedCandidate[] = [];
  const duplicates: RejectedCandidate[] = [];

  for (const cand of ordered) {
    const match = reps.find((rep) => looksDuplicate(rep, cand));
    if (match) {
      duplicates.push({
        url: cand.url,
        domain: cand.domain,
        reason: "duplicate",
        duplicateOf: match.url,
        detail: `${cand.width}×${cand.height}`,
      });
    } else {
      reps.push(cand);
    }
  }

  // Re-index the survivors so the AI stage sees a clean 0..n-1 sequence.
  reps.forEach((c, i) => (c.index = i));
  return { kept: reps, duplicates };
}
