/**
 * Stage 2 — Programmatic quality gate (the big accuracy upgrade).
 *
 * The old flow trusted Serper's metadata and handed raw URLs to the model.
 * Many were dead links, tiny thumbnails, wide banners, or near-identical
 * re-uploads. Here we actually DOWNLOAD each candidate and measure it with
 * `sharp`, so we can:
 *   - drop dead / non-image / undecodable URLs (a big "poor quality" source),
 *   - read TRUE pixel dimensions (Serper's are frequently missing/wrong),
 *   - reject low-resolution and banner-shaped images,
 *   - compute a perceptual hash (for zoom/crop de-dup downstream),
 *   - measure background whiteness (clean-packshot signal for the hero).
 */

import sharp from "sharp";
import { isOfficialSpecSourceUrl } from "@/lib/bikes/official-spec-sources";
import { runWithConcurrency } from "@/lib/admin/image-qa-speed";
import {
  isIdentityOfficialDomain,
  sourceAuthority,
  textRelevance,
  type ProductIdentity,
} from "./identity";
import type { AnalyzedCandidate, RawHit, RejectedCandidate } from "./types";

const FETCH_TIMEOUT_MS = 8000;
const FETCH_CONCURRENCY = 8;
const MIN_LONG_EDGE = 500; // px on the longest side
const MIN_MEGAPIXELS = 0.18;
const MIN_ASPECT = 0.5; // taller than this (portrait limit)
const MAX_ASPECT = 2.0; // wider than this is a banner / strip
const MAX_DOWNLOAD_BYTES = 12_000_000;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 YellowJersey/1.0";

function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

async function downloadImage(url: string): Promise<Buffer | "dead" | "not_image"> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
    });
    if (!res.ok) return "dead";
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.startsWith("image/")) return "not_image";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return "dead";
    if (buf.byteLength > MAX_DOWNLOAD_BYTES) return buf.subarray(0, MAX_DOWNLOAD_BYTES);
    return buf;
  } catch {
    return "dead";
  }
}

/** Centre-crop fraction used for the secondary "zoom-aware" hash. */
export const CENTER_CROP = 0.78;

/**
 * 64-bit difference hash (dHash), returned as a 16-char hex string of 8 bytes.
 * Resize to 9×8 greyscale and compare each pixel to its right neighbour. Robust
 * to rescaling and recompression — the bulk of Serper duplicates. With
 * `centerCrop`, it hashes the central region instead, so a zoomed-in copy of a
 * shot matches the full-frame hash of the un-zoomed one (the "same photo,
 * different zoom" duplicate). Built byte-by-byte to avoid BigInt (ES2017).
 */
export async function computeDHash(buf: Buffer, centerCrop?: number): Promise<string> {
  let pipeline = sharp(buf, { failOn: "none" });
  if (centerCrop && centerCrop > 0 && centerCrop < 1) {
    const meta = await pipeline.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w > 0 && h > 0) {
      const cw = Math.max(1, Math.round(w * centerCrop));
      const ch = Math.max(1, Math.round(h * centerCrop));
      pipeline = sharp(buf, { failOn: "none" }).extract({
        left: Math.round((w - cw) / 2),
        top: Math.round((h - ch) / 2),
        width: cw,
        height: ch,
      });
    }
  }
  const raw = await pipeline.greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  const bytes: string[] = [];
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const left = raw[row * 9 + col];
      const right = raw[row * 9 + col + 1];
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    bytes.push(byte.toString(16).padStart(2, "0"));
  }
  return bytes.join("");
}

/**
 * Background whiteness + overall brightness from a 32×32 downsample.
 * whiteFraction = share of the 1-px border that is near-white — a strong
 * proxy for "studio packshot on white", which is what a hero should be.
 */
async function computeWhitenessAndBrightness(
  buf: Buffer,
): Promise<{ whiteFraction: number; brightness: number }> {
  const side = 32;
  const raw = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(side, side, { fit: "fill" })
    .raw()
    .toBuffer();

  let whiteBorder = 0;
  let borderCount = 0;
  let lumaSum = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 3;
      const r = raw[i];
      const g = raw[i + 1];
      const b = raw[i + 2];
      lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
      const isBorder = x === 0 || y === 0 || x === side - 1 || y === side - 1;
      if (isBorder) {
        borderCount++;
        if (r > 235 && g > 235 && b > 235) whiteBorder++;
      }
    }
  }
  return {
    whiteFraction: borderCount ? whiteBorder / borderCount : 0,
    brightness: lumaSum / (side * side),
  };
}

export interface AnalyzeResult {
  analyzed: AnalyzedCandidate[];
  rejected: RejectedCandidate[];
}

/**
 * Downloads + measures every hit (bounded concurrency) and partitions the pool
 * into usable candidates vs rejects (with reasons, for UI transparency).
 */
export async function analyzeCandidates(
  hits: RawHit[],
  identity: ProductIdentity,
): Promise<AnalyzeResult> {
  const officialOpts = { bikeBrand: identity.brand ?? null, specValue: identity.name };
  const canTextFilter = identity.brandTokens.length > 0 && identity.modelTokens.length > 0;

  const outcomes = await runWithConcurrency(
    hits.map((hit) => async (): Promise<AnalyzedCandidate | RejectedCandidate> => {
      const domain = hit.domain ?? domainOf(hit.url);

      const isOfficial =
        isIdentityOfficialDomain(identity, domain) ||
        isOfficialSpecSourceUrl(hit.url, officialOpts) ||
        (hit.source ? isOfficialSpecSourceUrl(hit.source, officialOpts) : false);
      const textScore = textRelevance(identity, {
        title: hit.title,
        source: hit.source,
        domain,
      });
      const sourceScore = isOfficial ? 1 : sourceAuthority(identity, domain);

      // High-precision early reject: a descriptive title that matches NEITHER the
      // brand nor any model token, from a non-official source, is almost always a
      // different product. Saves a download + keeps the vision pool clean.
      const titleTokenCount = (hit.title ?? "").split(/\s+/).filter((t) => t.length >= 3).length;
      if (canTextFilter && !isOfficial && textScore === 0 && titleTokenCount >= 3) {
        return {
          url: hit.url,
          domain,
          reason: "wrong_product",
          detail: hit.title?.slice(0, 80),
        };
      }

      const downloaded = await downloadImage(hit.url);
      if (downloaded === "dead") {
        return { url: hit.url, domain, reason: "dead_link" };
      }
      if (downloaded === "not_image") {
        return { url: hit.url, domain, reason: "not_image" };
      }

      let meta: sharp.Metadata;
      try {
        meta = await sharp(downloaded, { failOn: "none" }).metadata();
      } catch {
        return { url: hit.url, domain, reason: "decode_failed" };
      }
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (!width || !height) {
        return { url: hit.url, domain, reason: "decode_failed" };
      }

      const longEdge = Math.max(width, height);
      const megapixels = (width * height) / 1_000_000;
      if (longEdge < MIN_LONG_EDGE || megapixels < MIN_MEGAPIXELS) {
        return {
          url: hit.url,
          domain,
          reason: "too_small",
          detail: `${width}×${height}`,
        };
      }

      const aspectRatio = width / height;
      if (aspectRatio < MIN_ASPECT || aspectRatio > MAX_ASPECT) {
        return {
          url: hit.url,
          domain,
          reason: "bad_aspect",
          detail: aspectRatio.toFixed(2),
        };
      }

      let dhash: string;
      let dhashCenter: string;
      let whiteFraction = 0;
      let brightness = 0;
      try {
        dhash = await computeDHash(downloaded);
        dhashCenter = await computeDHash(downloaded, CENTER_CROP);
        const w = await computeWhitenessAndBrightness(downloaded);
        whiteFraction = w.whiteFraction;
        brightness = w.brightness;
      } catch {
        return { url: hit.url, domain, reason: "decode_failed" };
      }

      return {
        index: -1, // assigned after partition
        url: hit.url,
        thumbnailUrl: hit.thumbnailUrl,
        title: hit.title,
        domain,
        source: hit.source,
        query: hit.query,
        width,
        height,
        megapixels,
        aspectRatio,
        dhash,
        dhashCenter,
        whiteFraction,
        brightness,
        isOfficial,
        textScore,
        sourceScore,
        heroScore: 0,
      };
    }),
    FETCH_CONCURRENCY,
  );

  const analyzed: AnalyzedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const outcome of outcomes) {
    if ("reason" in outcome) rejected.push(outcome);
    else analyzed.push(outcome);
  }
  analyzed.forEach((c, i) => (c.index = i));
  return { analyzed, rejected };
}
