/**
 * Standalone proof that the perceptual-hash de-dup actually collapses
 * "same photo, different zoom/resolution" duplicates while keeping genuinely
 * different images. Generates synthetic images with sharp (no network/auth/AI)
 * and checks dHash Hamming distances + dedupeCandidates behaviour.
 *
 * Run: npx tsx scripts/test-hero-image-dedup.ts
 */

import sharp from "sharp";
import { CENTER_CROP, computeDHash } from "../src/lib/optimize/hero-images/analyze";
import { dedupeCandidates } from "../src/lib/optimize/hero-images/dedupe";
import type { AnalyzedCandidate } from "../src/lib/optimize/hero-images/types";

function popcount8(x: number): number {
  let c = 0;
  let v = x;
  while (v) {
    c += v & 1;
    v >>= 1;
  }
  return c;
}
function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 2) d += popcount8(parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16));
  return d;
}
/** Closest match across full + centre frames, mirroring dedupe's looksDuplicate. */
function dupDistance(a: AnalyzedCandidate, b: AnalyzedCandidate): number {
  return Math.min(
    hamming(a.dhash, b.dhash),
    hamming(a.dhash, b.dhashCenter),
    hamming(a.dhashCenter, b.dhash),
    hamming(a.dhashCenter, b.dhashCenter),
  );
}
async function hashes(buf: Buffer): Promise<{ full: string; center: string }> {
  return { full: await computeDHash(buf), center: await computeDHash(buf, CENTER_CROP) };
}

/** A deterministic "product photo": a coloured disc + bar on a white field. */
async function baseImage(size: number): Promise<Buffer> {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <circle cx="${size * 0.42}" cy="${size * 0.45}" r="${size * 0.28}" fill="#c0392b"/>
    <rect x="${size * 0.3}" y="${size * 0.72}" width="${size * 0.4}" height="${size * 0.08}" fill="#2c3e50"/>
    <rect x="${size * 0.55}" y="${size * 0.2}" width="${size * 0.18}" height="${size * 0.18}" fill="#27ae60"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A clearly different image. */
async function otherImage(size: number): Promise<Buffer> {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#ecf0f1"/>
    <polygon points="${size * 0.5},${size * 0.1} ${size * 0.9},${size * 0.9} ${size * 0.1},${size * 0.9}" fill="#8e44ad"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function mkCandidate(
  i: number,
  h: { full: string; center: string },
  w: number,
  ht: number,
  url: string,
): AnalyzedCandidate {
  return {
    index: i, url, width: w, height: ht, megapixels: (w * ht) / 1e6, aspectRatio: w / ht,
    dhash: h.full, dhashCenter: h.center, whiteFraction: 0.8, brightness: 230, isOfficial: false, heroScore: 0,
  };
}

async function main() {
  const base = await baseImage(900);
  // Same photo, just a higher-resolution re-upload.
  const hiRes = await sharp(base).resize(1400, 1400).png().toBuffer();
  // Same photo, "zoomed in" (~20% crop then scaled back up) — the painpoint.
  const zoomed = await sharp(base).extract({ left: 90, top: 90, width: 720, height: 720 }).resize(900, 900).png().toBuffer();
  // A genuinely different product.
  const other = await otherImage(900);

  const cBase = mkCandidate(0, await hashes(base), 900, 900, "base");
  const cHiRes = mkCandidate(1, await hashes(hiRes), 1400, 1400, "hires");
  const cZoom = mkCandidate(2, await hashes(zoomed), 900, 900, "zoom");
  const cOther = mkCandidate(3, await hashes(other), 900, 900, "other");

  const dHiRes = dupDistance(cBase, cHiRes);
  const dZoom = dupDistance(cBase, cZoom);
  const dOther = dupDistance(cBase, cOther);

  console.log("Closest-frame distance base↔hi-res resize :", dHiRes, "(expect ~0 → duplicate)");
  console.log("Closest-frame distance base↔zoomed crop   :", dZoom, "(expect ≤10 → duplicate)");
  console.log("Closest-frame distance base↔different img  :", dOther, "(expect >10 → distinct)");

  const { kept, duplicates } = dedupeCandidates([cBase, cHiRes, cZoom, cOther]);
  console.log("\nKept after de-dup:", kept.map((k) => `${k.url} ${k.width}x${k.height}`));
  console.log("Collapsed as duplicates:", duplicates.map((d) => `${d.url}→${d.duplicateOf}`));

  const keptUrls = new Set(kept.map((k) => k.url));
  const assertions: Array<[string, boolean]> = [
    ["hi-res resize is a duplicate of base", dHiRes <= 10],
    ["zoomed crop is a duplicate of base", dZoom <= 10],
    ["different image is NOT a duplicate", dOther > 10],
    ["different image survives de-dup", keptUrls.has("other")],
    ["the same-photo cluster collapses to ONE representative", kept.filter((k) => k.url !== "other").length === 1],
    ["highest-resolution copy is kept as representative", keptUrls.has("hires")],
  ];

  let allPass = true;
  console.log("");
  for (const [label, pass] of assertions) {
    console.log(`${pass ? "✅" : "❌"} ${label}`);
    if (!pass) allPass = false;
  }
  if (!allPass) {
    console.error("\nFAILED");
    process.exit(1);
  }
  console.log("\nALL PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
