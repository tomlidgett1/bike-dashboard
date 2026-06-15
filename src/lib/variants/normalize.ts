// ============================================================
// Variant title normalization (deterministic, no AI)
// ============================================================
// Strips size / colour / frame-size / wheel-size / gender / model-year
// tokens from a product title so that the same product in different
// configurations collapses to one comparison key and one suggested
// "base" (master) title. Conservative by design — when in doubt we
// keep the word, and the AI + human reviewer make the final call.

const SIZE_WORDS = new Set([
  "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl",
  "small", "medium", "large", "sm", "md", "lg",
]);

const COLOUR_WORDS = new Set([
  "black", "white", "red", "blue", "green", "yellow", "orange", "purple",
  "pink", "grey", "gray", "silver", "gold", "navy", "teal", "brown", "beige",
  "tan", "maroon", "olive", "lime", "cyan", "magenta", "turquoise", "charcoal",
  "bronze", "copper", "rose", "cream", "ivory", "khaki", "mint", "coral",
  "graphite", "gunmetal", "sand", "stone", "slate", "burgundy", "crimson",
]);

const GENDER_WORDS = new Set([
  "mens", "men", "womens", "women", "unisex", "kids", "kid", "youth", "junior",
  "boys", "girls", "ladies", "mens's", "women's", "men's",
]);

// Multi-word phrases removed before single-token filtering.
const PHRASES: RegExp[] = [
  /\bextra[\s-]?(small|large)\b/gi,
  /\bx[\s-]?(small|large)\b/gi,
  /\b(men|women|woman|man)['’]?s\b/gi,
  /\bone[\s-]?size\b/gi,
];

// Pattern removals (run on a lowercased, space-padded string).
const PATTERNS: RegExp[] = [
  /\b20[1-3]\d\b/g, // model year 2010–2039
  /\b\d{2}(?:\.\d)?\s?cm\b/g, // frame size e.g. 54cm / 54 cm / 54.5cm
  /\b\d{2}(?:\.\d)?\s?(?:"|”|″|inch(?:es)?|in)(?=[\s\-/|,]|$)/g, // wheel size e.g. 29", 27.5 inch
  /\b\d{2}er\b/g, // wheel size shorthand e.g. 29er
  /\b(?:700c|650b)\b/g, // road / gravel wheel sizes
  /\b(?:xs|s|m|l|xl|xxl)\s?\/\s?(?:xs|s|m|l|xl|xxl)\b/g, // S/M, M/L
];

function preClean(lower: string): string {
  let s = ` ${lower} `;
  for (const phrase of PHRASES) s = s.replace(phrase, " ");
  for (const pattern of PATTERNS) s = s.replace(pattern, " ");
  return s;
}

function isVariantToken(token: string): boolean {
  const t = token.toLowerCase();
  return SIZE_WORDS.has(t) || COLOUR_WORDS.has(t) || GENDER_WORDS.has(t);
}

/**
 * A stable, aggressively-normalized key used to bucket products.
 * Lowercased, variant tokens removed, punctuation flattened.
 */
export function variantComparisonKey(title: string): string {
  if (!title) return "";
  const cleaned = preClean(title.toLowerCase());
  return cleaned
    .split(/[^a-z0-9.]+/i)
    .filter((tok) => tok && !isVariantToken(tok))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A human-facing suggested master title with original casing preserved
 * (e.g. "Giro Fixture Helmet Small Black" -> "Giro Fixture Helmet").
 */
export function suggestBaseTitle(title: string): string {
  if (!title) return "";
  // Remove patterns/phrases on a lowercased copy, then map kept words back
  // to their original casing by filtering the original token stream.
  const removedLower = preClean(title.toLowerCase());
  const keptLowerTokens = new Set(
    removedLower.split(/[^a-z0-9.]+/i).filter(Boolean).filter((t) => !isVariantToken(t)),
  );

  const result: string[] = [];
  for (const original of title.split(/(\s+)/)) {
    if (/^\s+$/.test(original)) {
      result.push(original);
      continue;
    }
    const stripped = original.toLowerCase().replace(/[^a-z0-9.]+/gi, "");
    if (!stripped) continue; // pure punctuation token (e.g. "-", "/")
    if (isVariantToken(stripped)) continue;
    if (!keptLowerTokens.has(stripped)) continue; // removed by a pattern (year/cm/etc.)
    result.push(original);
  }

  return result
    .join("")
    .replace(/[\s,–\-/|]+$/g, "") // tidy trailing separators
    .replace(/^[\s,–\-/|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a brand for keying (lowercased, trimmed). */
export function normalizeBrandKey(brand: string | null | undefined): string {
  return (brand ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type ExtractedVariantTokens = { sizes: string[]; colours: string[]; others: string[] };

/**
 * The inverse of stripping: pull the variant-like tokens OUT of a title so we
 * can recover the size/colour the cleaned Yellow Jersey name may have dropped.
 * Used to cross-check the original Lightspeed listing for high confidence.
 */
export function extractVariantTokens(title: string): ExtractedVariantTokens {
  const sizes: string[] = [];
  const colours: string[] = [];
  const others: string[] = [];
  if (!title) return { sizes, colours, others };

  const padded = ` ${title.toLowerCase()} `;
  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(padded)) !== null) {
      const value = match[0].trim();
      if (value && !others.includes(value)) others.push(value);
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }

  for (const original of title.split(/[^A-Za-z0-9.]+/)) {
    const lower = original.toLowerCase();
    if (!lower) continue;
    if (SIZE_WORDS.has(lower)) {
      if (!sizes.some((s) => s.toLowerCase() === lower)) sizes.push(original);
    } else if (COLOUR_WORDS.has(lower)) {
      if (!colours.some((c) => c.toLowerCase() === lower)) colours.push(original);
    }
  }

  return { sizes, colours, others };
}

/** A normalized signature of a listing's variant tokens (for cross-checking two listings). */
export function variantTokenSignature(title: string): string {
  const { sizes, colours, others } = extractVariantTokens(title);
  return [...sizes, ...colours, ...others]
    .map((t) => t.toLowerCase())
    .sort()
    .join("|");
}
