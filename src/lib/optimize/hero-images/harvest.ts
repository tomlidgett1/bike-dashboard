/**
 * Stage 1 — Multi-query Serper harvest, driven by the resolved identity.
 *
 * The old catalogue flow runs a SINGLE query and takes whatever Google Images
 * returns. We instead fan out several complementary queries (brand+model, UPC,
 * official-site `site:` queries for EVERY derivable brand domain, a variant-
 * qualified query, and a white-background packshot bias) and merge the results.
 * This both widens the pool and pulls in clean images straight from manufacturer
 * sites — the highest-quality source available.
 *
 * Serper itself is reached through the injected `serperSearch` function so the
 * caller controls auth (we go via the Supabase edge function which holds the
 * SERPER_API_KEY).
 */

import type { ProductIdentity } from "./identity";
import { domainOf } from "./identity";
import type { RawHit } from "./types";

export type SerperSearch = (query: string) => Promise<RawHit[]>;

const BLOCKED_DOMAINS = [
  "pinterest.",
  "facebook.",
  "instagram.",
  "reddit.",
  "youtube.",
  "tiktok.",
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
  "lookaside.",
  "fbsbx.com",
];

const MAX_QUERIES = 7;
const MAX_POOL = 80;

/** Strip resize/query params so `…/img.jpg?w=200` and `?w=1200` collapse early. */
function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.toLowerCase()}`;
  } catch {
    return url.toLowerCase();
  }
}

export function buildHarvestQueries(identity: ProductIdentity): string[] {
  const { name, brand, upc } = identity;
  const branded =
    brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name;

  const queries: string[] = [];

  // 1. The most specific identifier we have wins first.
  if (upc) queries.push(`${branded} ${upc}`);

  // 2. The plain branded name (broadest reliable query).
  queries.push(branded);

  // 3. A variant-qualified query so the pool leans toward the EXACT variant,
  //    not just the model family (colour first, else year).
  const variant =
    identity.attributes.colors[0] ?? identity.attributes.year ?? identity.attributes.capacities[0];
  if (variant && !branded.toLowerCase().includes(variant.toLowerCase())) {
    queries.push(`${branded} ${variant}`);
  }

  // 4. Official manufacturer sites — clean, canonical product photography.
  //    Now works for ANY brand because officialDomains is derived dynamically.
  for (const domain of identity.officialDomains.slice(0, 2)) {
    queries.push(`${identity.core} site:${domain}`);
  }

  // 5. Bias one query toward a clean studio packshot for the hero.
  queries.push(`${branded} product photo white background`);

  // De-dupe, keep order, cap.
  return Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean))).slice(0, MAX_QUERIES);
}

function isUsableHit(hit: RawHit): boolean {
  const url = hit.url?.trim();
  if (!url || !url.startsWith("http")) return false;
  const domain = domainOf(url);
  if (!domain) return false;
  if (BLOCKED_DOMAINS.some((b) => domain.includes(b))) return false;
  return true;
}

export interface HarvestResult {
  hits: RawHit[];
  queriesUsed: string[];
}

/**
 * Runs every harvest query (in parallel), merges + de-dupes by normalised URL,
 * and lightly interleaves results so the pool isn't dominated by one query.
 */
export async function harvestSerperImages(
  identity: ProductIdentity,
  serperSearch: SerperSearch,
): Promise<HarvestResult> {
  const queries = buildHarvestQueries(identity);

  const settled = await Promise.all(
    queries.map(async (q) => {
      try {
        const hits = await serperSearch(q);
        return hits.map((h) => ({ ...h, query: q }));
      } catch {
        return [] as RawHit[];
      }
    }),
  );

  // Interleave: take the Nth hit from each query in turn so official-site and
  // UPC results (usually fewer) aren't buried under the broad branded query.
  const merged: RawHit[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(0, ...settled.map((s) => s.length));
  for (let i = 0; i < maxLen && merged.length < MAX_POOL; i++) {
    for (const hits of settled) {
      const hit = hits[i];
      if (!hit || !isUsableHit(hit)) continue;
      const key = urlKey(hit.url);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
      if (merged.length >= MAX_POOL) break;
    }
  }

  return { hits: merged, queriesUsed: queries };
}
