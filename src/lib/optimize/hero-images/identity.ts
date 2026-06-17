/**
 * Product identity resolution — the matching brain of the pipeline.
 *
 * "Poor selection" almost always traces back to a weak idea of WHAT the product
 * actually is. The old flow knew only the raw Lightspeed name and a 36-brand
 * hardcode for "official". This module builds a far richer identity from the
 * name + brand + UPC + description:
 *
 *   - brand / model / distinctive tokens (for text matching),
 *   - variant attributes parsed from BOTH name and description
 *     (colour, size, model year, capacity) — so we can confirm the hero matches
 *     the listing, not just a similar sibling model,
 *   - official domains derived DYNAMICALLY so the "prefer official sources"
 *     signal works for every brand, not just the hardcoded few.
 *
 * It then exposes the three scores the rest of the pipeline ranks on:
 *   textRelevance()  — does this hit's title/source describe THIS product?
 *   sourceAuthority() — how trustworthy is the domain it came from?
 *   isIdentityOfficialDomain() — is this the brand's own site?
 */

import { getOfficialSearchDomains } from "@/lib/bikes/official-spec-sources";
import { brandWebsiteDomain, resolveBrandWebsite } from "@/lib/bikes/brand-websites";

export interface ProductAttributes {
  colors: string[];
  sizes: string[];
  /** Model year, e.g. "2023". */
  year: string | null;
  /** Capacities/measurements that disambiguate variants: "800lm", "500ml", "10000mah". */
  capacities: string[];
}

export interface ProductIdentity {
  name: string;
  brand: string | null;
  upc: string | null;

  /** Lowercased, accent-stripped brand slug with spaces removed (for domain matching). */
  brandSlug: string | null;
  brandTokens: string[];
  /** Distinctive model tokens (alphanumerics / model codes), brand + colour removed. */
  modelTokens: string[];
  /** All meaningful tokens used for matching. */
  allTokens: string[];

  attributes: ProductAttributes;

  /** Domains we both target with `site:` queries and recognise as official. */
  officialDomains: string[];

  /** Tight "brand + strongest model tokens" string for a focused query. */
  core: string;
}

/** Domains that are never an authoritative product source (stock, social, marketplaces). */
const LOW_AUTHORITY_FRAGMENTS = [
  "pinterest.",
  "facebook.",
  "instagram.",
  "reddit.",
  "youtube.",
  "tiktok.",
  "twitter.",
  "x.com",
  "alamy.",
  "shutterstock.",
  "istockphoto.",
  "gettyimages.",
  "dreamstime.",
  "123rf.",
  "ebay.",
  "aliexpress.",
  "alibaba.",
  "wish.com",
  "temu.",
  "etsy.",
  "lookaside.",
  "fbsbx.com",
  "wikipedia.",
  "wikimedia.",
  "amazon.",
  "google.",
  "bing.",
];

/**
 * Retailers/distributors that tend to host clean, correctly-labelled packshots.
 * Not official, but a notch above an unknown domain. Kept deliberately small —
 * the point is a mild lift, not a whitelist to game.
 */
const REPUTABLE_RETAILER_FRAGMENTS = [
  "wiggle.",
  "chainreaction",
  "jensonusa",
  "competitivecyclist",
  "backcountry",
  "rei.com",
  "evanscycles",
  "probikeshop",
  "bike24.",
  "bike-components.",
  "tredz.",
  "sigmasports.",
  "merlincycles.",
  "pushys.",
  "bikebug.",
  "99bikes.",
  "cyclingexpress.",
  "trekbikes.com",
];

/** Suffixes a brand may append to its own name in its domain (brand, not retailer). */
const BRAND_DOMAIN_SUFFIXES = new Set([
  "bikes", "bike", "cycles", "cycle", "cycling", "bicycles", "bicycle",
  "sport", "sports", "racing", "components", "wheels", "tires", "tyres",
  "usa", "cc", "co", "official",
]);

const COLOR_WORDS = [
  "black", "white", "red", "blue", "green", "yellow", "orange", "purple",
  "pink", "grey", "gray", "silver", "gold", "teal", "navy", "olive", "tan",
  "brown", "bronze", "titanium", "carbon", "raw", "copper", "chrome", "matte",
  "gloss", "neon", "lime", "turquoise", "burgundy", "maroon", "beige", "cream",
  "khaki", "charcoal", "graphite", "rose", "coral", "mint", "sand",
];

/** Single-token model words that carry no identity on their own. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "new", "set", "kit", "pack", "pair", "size",
  "color", "colour", "mens", "womens", "men", "women", "unisex", "bike",
  "bicycle", "cycling", "cycle", "official", "genuine", "oem", "product",
  "photo", "image", "white", "background", "edition", "version", "model",
  "series", "ml", "of", "to", "a", "in", "on", "by",
]);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalise(text)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** A token is "distinctive" if it contains a digit or is reasonably long. */
function isDistinctive(token: string): boolean {
  return /\d/.test(token) || token.length >= 3;
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Root label of a domain, e.g. "lezyne" from "lezyne.com.au". */
function rootLabel(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return parts[0] ?? domain;
  // Handle co.uk / com.au style two-part TLDs by taking the label before them.
  const tld2 = parts.slice(-2).join(".");
  if (["co.uk", "com.au", "co.nz", "com.br", "co.za"].includes(tld2)) {
    return parts[parts.length - 3] ?? parts[0];
  }
  return parts[parts.length - 2] ?? parts[0];
}

function extractAttributes(haystack: string): ProductAttributes {
  const norm = ` ${normalise(haystack)} `;

  const colors = COLOR_WORDS.filter((c) => norm.includes(` ${c} `));

  const sizes = new Set<string>();
  // Frame/clothing sizes as standalone tokens.
  for (const m of norm.matchAll(/\b(xxs|xs|sm|md|lg|xl|xxl|xxxl|s|m|l)\b/g)) {
    sizes.add(m[1]);
  }
  // Numeric frame sizes ("54cm", "56 cm").
  for (const m of norm.matchAll(/\b(\d{2})\s?cm\b/g)) sizes.add(`${m[1]}cm`);
  // Wheel sizes.
  for (const m of norm.matchAll(/\b(26|27\.5|29|650b|700c|24|20|16)\b/g)) sizes.add(m[1]);

  let year: string | null = null;
  const yearMatch = norm.match(/\b(20[1-3]\d)\b/);
  if (yearMatch) year = yearMatch[1];

  const capacities = new Set<string>();
  for (const m of norm.matchAll(/\b(\d{2,6})\s?(lm|lumens|ml|l|mah|wh|psi|nm|mm|t|g|kg)\b/g)) {
    const unit = m[2] === "lumens" ? "lm" : m[2];
    capacities.add(`${m[1]}${unit}`);
  }

  return {
    colors,
    sizes: [...sizes],
    year,
    capacities: [...capacities],
  };
}

/**
 * Candidate official domains derived purely from the brand string. We can't
 * verify these exist, but using them for `site:` queries is harmless (a dead
 * site: query just returns nothing) and recognising them lifts true official
 * images to the top — for ANY brand, not just the hardcoded list.
 */
function deriveCandidateOfficialDomains(brandSlug: string | null): string[] {
  if (!brandSlug || brandSlug.length < 3) return [];
  return [
    `${brandSlug}.com`,
    `${brandSlug}.com.au`,
    `${brandSlug}.cc`,
    `${brandSlug}bikes.com`,
    `${brandSlug}-bikes.com`,
    `${brandSlug}bicycles.com`,
    `ride${brandSlug}.com`,
  ];
}

export function buildProductIdentity(input: {
  name: string;
  brand?: string | null;
  upc?: string | null;
  description?: string | null;
  searchQuery?: string | null;
}): ProductIdentity {
  const name = input.name.trim();
  const brand = input.brand?.trim() || null;
  const upc = input.upc?.trim() || null;

  const brandSlug = brand ? normalise(brand).replace(/\s+/g, "") : null;
  const brandTokens = brand ? tokenize(brand) : [];

  const nameTokens = tokenize(name);
  const brandTokenSet = new Set(brandTokens);
  const colorSet = new Set(COLOR_WORDS);
  const modelTokens = nameTokens.filter(
    (t) => !brandTokenSet.has(t) && !colorSet.has(t) && isDistinctive(t),
  );

  // Attributes draw on name + description so we can confirm the actual variant.
  const attrHaystack = [name, input.description ?? ""].join(" ");
  const attributes = extractAttributes(attrHaystack);

  // Official domains: hardcoded knowledge first (most reliable), then derived.
  const officialDomains = new Set<string>();
  for (const d of getOfficialSearchDomains({ bikeBrand: brand, specValue: name })) {
    officialDomains.add(d.replace(/^www\./, "").toLowerCase());
  }
  const resolved = resolveBrandWebsite(brand);
  const resolvedDomain = resolved ? brandWebsiteDomain(resolved) : null;
  if (resolvedDomain) officialDomains.add(resolvedDomain.replace(/^www\./, "").toLowerCase());
  for (const d of deriveCandidateOfficialDomains(brandSlug)) officialDomains.add(d);

  const allTokens = Array.from(new Set([...brandTokens, ...modelTokens]));
  const core = [brand, ...modelTokens.slice(0, 4)].filter(Boolean).join(" ").trim() || name;

  return {
    name,
    brand,
    upc,
    brandSlug,
    brandTokens,
    modelTokens,
    allTokens,
    attributes,
    officialDomains: [...officialDomains],
    core,
  };
}

/** Hardcoded + derived official domain match, plus a brand-slug fallback. */
export function isIdentityOfficialDomain(
  identity: ProductIdentity,
  domain: string | null | undefined,
): boolean {
  if (!domain) return false;
  const d = domain.replace(/^www\./, "").toLowerCase();

  if (LOW_AUTHORITY_FRAGMENTS.some((f) => d.includes(f))) return false;
  if (REPUTABLE_RETAILER_FRAGMENTS.some((f) => d.includes(f) && f !== "trekbikes.com")) {
    // A retailer that merely contains the brand name shouldn't read as official.
    return false;
  }

  if (
    identity.officialDomains.some(
      (od) => d === od || d.endsWith(`.${od}`) || od.endsWith(`.${d}`),
    )
  ) {
    return true;
  }

  // Brand-slug fallback: the domain's root label IS the brand (e.g. "lezyne.cc",
  // "lezynebikes.com"). High-precision on purpose — a retailer like
  // "trekbikeshop.com.au" must NOT read as official, so we only accept the bare
  // slug or the slug + a recognised brand suffix, never arbitrary extra words.
  const slug = identity.brandSlug;
  if (slug && slug.length >= 4) {
    const root = rootLabel(d);
    if (root === slug) return true;
    if (root.startsWith(slug) && BRAND_DOMAIN_SUFFIXES.has(root.slice(slug.length))) {
      return true;
    }
  }
  return false;
}

/**
 * 0..1 — how much a hit's free text (title + source + domain) describes THIS
 * product. Brand and distinctive model tokens carry the most weight; variant
 * attributes (colour/year/capacity) add confidence. Returns a neutral 0.5 only
 * when we genuinely have nothing to match on.
 */
export function textRelevance(
  identity: ProductIdentity,
  hit: { title?: string; source?: string; domain?: string },
): number {
  const haystackTokens = new Set(
    tokenize([hit.title ?? "", hit.source ?? "", hit.domain ?? ""].join(" ")),
  );
  if (haystackTokens.size === 0) return 0.4; // no text to judge — mildly cautious

  const hasModel = identity.modelTokens.length > 0;
  const hasBrand = identity.brandTokens.length > 0;
  if (!hasModel && !hasBrand) return 0.5;

  let score = 0;
  let weight = 0;

  if (hasBrand) {
    const brandHit = identity.brandTokens.some((t) => haystackTokens.has(t));
    score += (brandHit ? 1 : 0) * 0.35;
    weight += 0.35;
  }

  if (hasModel) {
    const matched = identity.modelTokens.filter((t) => haystackTokens.has(t)).length;
    score += (matched / identity.modelTokens.length) * 0.45;
    weight += 0.45;
  }

  // Attribute bonuses (only count attributes the product actually declares).
  const attrTokens = [
    ...identity.attributes.colors,
    ...identity.attributes.sizes,
    ...identity.attributes.capacities,
    ...(identity.attributes.year ? [identity.attributes.year] : []),
  ];
  if (attrTokens.length > 0) {
    const matched = attrTokens.filter((t) => haystackTokens.has(t)).length;
    score += Math.min(matched / attrTokens.length, 1) * 0.2;
    weight += 0.2;
  }

  return weight > 0 ? Math.min(score / weight, 1) : 0.5;
}

/** 0..1 — trust in the domain as a product-image source. */
export function sourceAuthority(
  identity: ProductIdentity,
  domain: string | null | undefined,
): number {
  if (!domain) return 0.4;
  const d = domain.replace(/^www\./, "").toLowerCase();
  if (LOW_AUTHORITY_FRAGMENTS.some((f) => d.includes(f))) return 0.1;
  if (isIdentityOfficialDomain(identity, d)) return 1;
  if (REPUTABLE_RETAILER_FRAGMENTS.some((f) => d.includes(f))) return 0.6;
  return 0.45;
}
