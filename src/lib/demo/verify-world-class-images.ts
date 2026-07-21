/**
 * Vision verification for world-class product page images.
 *
 * The Serper text scorer upstream is only a cheap pre-filter — result titles
 * routinely lie (a "Trek Madone" query returns Émondas and random road bikes).
 * Every candidate that survives it is therefore shown to a strong vision
 * model together with the OFFICIAL product identity (exact model, year,
 * stated colourways from the brand-site extraction) and must be positively
 * confirmed before it can appear on the page:
 *
 *   - wrong model / sibling model / different generation → rejected
 *   - correct model in a colourway the page doesn't describe → rejected
 *     whenever colour-matching images exist (hero can never mismatch)
 *   - each keeper is angle-classified so the template can pick a hero and a
 *     genuinely different secondary shot (not two front-ons of the same bike)
 */

import OpenAI from "openai";
import type {
  WorldClassImage,
  WorldClassProductKind,
} from "./world-class-product-page-types";

const VISION_MODEL = "gpt-5.4";
const CHUNK_SIZE = 7;
const MIN_CONFIDENCE = 0.65;
const MAX_IMAGES = 12;

export type ImageViewAngle =
  | "full_side"
  | "full_three_quarter"
  | "full_front"
  | "full_rear"
  | "studio_packshot"
  | "detail_closeup"
  | "action_riding"
  | "lifestyle"
  | "other";

type ImageVerdict = {
  index: number;
  isExactProduct: boolean;
  confidence: number;
  colourMatch: "match" | "different_colourway" | "not_applicable";
  viewAngle: ImageViewAngle;
  quality: number;
  reason: string;
};

export type VerifyImagesOptions = {
  productName: string;
  brand: string | null;
  productKind: WorldClassProductKind;
  /** Raw official-site extraction; colourways/year/category are read from it. */
  officialData: Record<string, unknown>;
  images: WorldClassImage[];
};

const COLOUR_LABEL_RE = /colou?r|paint|finish|shade/i;

function specSections(
  officialData: Record<string, unknown>,
): Array<{ title?: unknown; specs?: unknown }> {
  return Array.isArray(officialData.specifications)
    ? (officialData.specifications as Array<{ title?: unknown; specs?: unknown }>)
    : [];
}

/** Colourway strings the official site states for this exact product. */
export function extractStatedColourways(
  officialData: Record<string, unknown>,
): string[] {
  const found = new Set<string>();
  const consider = (label: unknown, value: unknown) => {
    if (typeof label !== "string" || typeof value !== "string") return;
    if (!COLOUR_LABEL_RE.test(label)) return;
    const cleaned = value.trim();
    if (cleaned && cleaned.length <= 120) found.add(cleaned);
  };

  for (const section of specSections(officialData)) {
    const specs = Array.isArray(section.specs)
      ? (section.specs as Array<{ label?: unknown; value?: unknown }>)
      : [];
    for (const spec of specs) consider(spec.label, spec.value);
  }
  const keyStats = Array.isArray(officialData.keyStats)
    ? (officialData.keyStats as Array<{ label?: unknown; value?: unknown }>)
    : [];
  for (const stat of keyStats) consider(stat.label, stat.value);

  return [...found];
}

function identityBrief(options: VerifyImagesOptions): string {
  const { officialData } = options;
  const lines: string[] = [
    `Product: "${options.productName}"`,
    options.brand ? `Brand: ${options.brand}` : null,
    typeof officialData.modelYear === "string" && officialData.modelYear
      ? `Model year: ${officialData.modelYear}`
      : null,
    options.productKind === "non_bike"
      ? typeof officialData.productCategory === "string" &&
        officialData.productCategory
        ? `Category: ${officialData.productCategory}`
        : "Category: cycling accessory or component"
      : typeof officialData.bikeType === "string" && officialData.bikeType
        ? `Bike type: ${officialData.bikeType}`
        : "Bike type: bicycle",
  ].filter((line): line is string => !!line);

  const colourways = extractStatedColourways(officialData);
  if (colourways.length > 0) {
    lines.push(`Stated colourway(s): ${colourways.join(" | ")}`);
  }

  // A few distinguishing specs (frame material, groupset…) help the model
  // separate sibling trims that share a silhouette.
  const distinguishing: string[] = [];
  for (const section of specSections(officialData)) {
    const specs = Array.isArray(section.specs)
      ? (section.specs as Array<{ label?: unknown; value?: unknown }>)
      : [];
    for (const spec of specs) {
      if (typeof spec.label !== "string" || typeof spec.value !== "string") continue;
      if (/frame|fork|groupset|drivetrain|wheel|material|weight/i.test(spec.label)) {
        distinguishing.push(`${spec.label}: ${spec.value}`);
      }
      if (distinguishing.length >= 6) break;
    }
    if (distinguishing.length >= 6) break;
  }
  if (distinguishing.length > 0) {
    lines.push(`Key specs: ${distinguishing.join("; ")}`);
  }
  return lines.join("\n");
}

function verificationPrompt(
  brief: string,
  productKind: WorldClassProductKind,
  count: number,
): string {
  const subject = productKind === "non_bike" ? "product" : "bike";
  return `You are the final quality gate for product photography on a premium ${subject} page. Study each numbered image carefully and decide whether it truly shows the EXACT product below. Be sceptical: search-engine titles lie, and a lookalike or sibling model slipping through is a serious failure.

${brief}

For EACH of the ${count} images return a verdict:
- isExactProduct: true ONLY if you are confident this is the exact make and model (same generation/trim). A different model from the same brand, a lookalike from another brand, a different generation, a bundle, or an unrelated ${subject} is false.
- confidence: 0.0-1.0 — your probability that isExactProduct is right. Use decal text, frame shape, component spec, paint scheme, and any visible branding as evidence.
- colourMatch: "match" if the ${subject} shown is in one of the stated colourway(s); "different_colourway" if it is clearly the right product but in a colour the listing does not state; "not_applicable" if no colourway is stated or colour cannot be judged.
- viewAngle: one of full_side, full_three_quarter, full_front, full_rear, studio_packshot, detail_closeup, action_riding, lifestyle, other.
- quality: 0.0-1.0 for photographic quality as premium product imagery (sharp, well lit, clean background or compelling action; screenshots, collages, watermarked or text-heavy images score low).
- reason: one short sentence of evidence.

Return ONLY valid JSON (no markdown):
{ "verdicts": [ { "index": 0, "isExactProduct": true, "confidence": 0.9, "colourMatch": "match", "viewAngle": "full_side", "quality": 0.8, "reason": "..." } ] }`;
}

type ChunkContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

function chunkContent(images: WorldClassImage[]): ChunkContentPart[] {
  const parts: ChunkContentPart[] = [];
  images.forEach((image, index) => {
    const caption = (image.caption ?? "").slice(0, 120).replace(/\s+/g, " ").trim();
    parts.push({
      type: "text",
      text: `Image ${index}: title="${caption || "(none)"}" · source=${
        image.sourceUrl ?? "unknown"
      }`,
    });
    parts.push({ type: "image_url", image_url: { url: image.url, detail: "high" } });
  });
  return parts;
}

function parseVerdicts(raw: string, count: number): ImageVerdict[] {
  const parsed = JSON.parse(raw) as { verdicts?: unknown };
  if (!Array.isArray(parsed.verdicts)) return [];
  const verdicts: ImageVerdict[] = [];
  for (const row of parsed.verdicts) {
    if (!row || typeof row !== "object") continue;
    const v = row as Partial<ImageVerdict>;
    const index = Number(v.index);
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    verdicts.push({
      index,
      isExactProduct: v.isExactProduct === true,
      confidence: Math.max(0, Math.min(1, Number(v.confidence ?? 0))),
      colourMatch:
        v.colourMatch === "match" || v.colourMatch === "different_colourway"
          ? v.colourMatch
          : "not_applicable",
      viewAngle:
        typeof v.viewAngle === "string" &&
        [
          "full_side",
          "full_three_quarter",
          "full_front",
          "full_rear",
          "studio_packshot",
          "detail_closeup",
          "action_riding",
          "lifestyle",
          "other",
        ].includes(v.viewAngle)
          ? (v.viewAngle as ImageViewAngle)
          : "other",
      quality: Math.max(0, Math.min(1, Number(v.quality ?? 0))),
      reason: typeof v.reason === "string" ? v.reason : "",
    });
  }
  return verdicts;
}

async function verifyChunk(
  openai: OpenAI,
  prompt: string,
  images: WorldClassImage[],
): Promise<ImageVerdict[]> {
  const completion = await openai.chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.1,
    max_completion_tokens: 2400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...chunkContent(images)],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Vision verification returned no content");
  return parseVerdicts(raw, images.length);
}

const HERO_ANGLE_PREFERENCE: Partial<Record<ImageViewAngle, number>> = {
  full_three_quarter: 1,
  full_side: 0.95,
  studio_packshot: 0.85,
  full_front: 0.6,
  full_rear: 0.4,
};

function heroScore(image: WorldClassImage, verdict: ImageVerdict): number {
  const anglePreference = HERO_ANGLE_PREFERENCE[verdict.viewAngle] ?? 0.15;
  return anglePreference * 0.35 + verdict.quality * 0.35 + verdict.confidence * 0.3;
}

function roleForAngle(angle: ImageViewAngle): WorldClassImage["role"] {
  if (angle === "action_riding" || angle === "lifestyle") return "lifestyle";
  if (angle === "detail_closeup") return "detail";
  return "gallery";
}

/**
 * Verify candidate images with vision and return only confirmed ones, hero
 * first, angle-tagged. Returns null when the vision service itself was
 * unavailable (caller may fall back); an empty array is a real "nothing
 * passed" verdict and must be respected.
 */
export async function verifyWorldClassImages(
  openai: OpenAI,
  options: VerifyImagesOptions,
): Promise<WorldClassImage[] | null> {
  const candidates = options.images.slice(0, 28);
  if (candidates.length === 0) return [];

  const brief = identityBrief(options);
  const chunks: WorldClassImage[][] = [];
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    chunks.push(candidates.slice(i, i + CHUNK_SIZE));
  }

  let anyChunkSucceeded = false;
  const kept: Array<{ image: WorldClassImage; verdict: ImageVerdict }> = [];

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const prompt = verificationPrompt(brief, options.productKind, chunk.length);
      try {
        return await verifyChunk(openai, prompt, chunk);
      } catch {
        try {
          return await verifyChunk(openai, prompt, chunk);
        } catch {
          return null;
        }
      }
    }),
  );

  results.forEach((verdicts, chunkIndex) => {
    if (!verdicts) return;
    anyChunkSucceeded = true;
    const chunk = chunks[chunkIndex];
    for (const verdict of verdicts) {
      const image = chunk[verdict.index];
      if (!image) continue;
      if (!verdict.isExactProduct || verdict.confidence < MIN_CONFIDENCE) continue;
      kept.push({ image, verdict });
    }
  });

  if (!anyChunkSucceeded) return null;

  // Colourway discipline: when the listing states a colour and we have images
  // in it, images of other colourways are dropped — a "blue" page never shows
  // the red bike.
  const hasColourMatch = kept.some((entry) => entry.verdict.colourMatch === "match");
  const filtered = hasColourMatch
    ? kept.filter((entry) => entry.verdict.colourMatch !== "different_colourway")
    : kept;

  if (filtered.length === 0) return [];

  const heroEntry = filtered.reduce((best, entry) =>
    heroScore(entry.image, entry.verdict) > heroScore(best.image, best.verdict)
      ? entry
      : best,
  );

  const rest = filtered
    .filter((entry) => entry !== heroEntry)
    .sort(
      (a, b) =>
        b.verdict.quality * 0.6 +
        b.verdict.confidence * 0.4 -
        (a.verdict.quality * 0.6 + a.verdict.confidence * 0.4),
    );

  const ordered = [heroEntry, ...rest].slice(0, MAX_IMAGES);
  return ordered.map((entry, index) => ({
    ...entry.image,
    role: index === 0 ? "hero" : roleForAngle(entry.verdict.viewAngle),
    viewAngle: entry.verdict.viewAngle,
  }));
}

/**
 * Vision-check competitor thumbnails in one call: each image must actually
 * show the named rival product. Mismatches are nulled out (the comparison
 * card renders fine without an image). On API failure the originals are kept.
 */
export async function verifyCompetitorImages(
  openai: OpenAI,
  competitorImages: Map<string, string | null>,
  productKind: WorldClassProductKind,
): Promise<Map<string, string | null>> {
  const entries = [...competitorImages.entries()].filter(
    (entry): entry is [string, string] => !!entry[1],
  );
  if (entries.length === 0) return competitorImages;

  const subject = productKind === "non_bike" ? "product" : "bike";
  const parts: ChunkContentPart[] = [];
  entries.forEach(([name, url], index) => {
    parts.push({ type: "text", text: `Image ${index}: should show "${name}"` });
    parts.push({ type: "image_url", image_url: { url, detail: "low" } });
  });

  const prompt = `Each numbered image below is meant to show the ${subject} named next to it (any colourway is fine). For each, decide whether the image plausibly shows that exact make and model. Return ONLY valid JSON (no markdown):
{ "verdicts": [ { "index": 0, "matches": true, "confidence": 0.9 } ] }`;

  try {
    const completion = await openai.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.1,
      max_completion_tokens: 900,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...parts] }],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return competitorImages;
    const parsed = JSON.parse(raw) as {
      verdicts?: Array<{ index?: unknown; matches?: unknown; confidence?: unknown }>;
    };
    if (!Array.isArray(parsed.verdicts)) return competitorImages;

    const result = new Map(competitorImages);
    for (const verdict of parsed.verdicts) {
      const index = Number(verdict.index);
      if (!Number.isInteger(index) || index < 0 || index >= entries.length) continue;
      const confidence = Math.max(0, Math.min(1, Number(verdict.confidence ?? 0)));
      if (verdict.matches !== true || confidence < 0.55) {
        result.set(entries[index][0], null);
      }
    }
    return result;
  } catch {
    return competitorImages;
  }
}
