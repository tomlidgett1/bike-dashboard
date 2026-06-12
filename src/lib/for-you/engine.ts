import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";
import { collectSignals, persistPreferenceProfile } from "./signals";
import { fetchCandidates, validateProductIds } from "./candidates";
import { buildDeterministicFeed, buildLlmSummary } from "./feed";
import { enhanceFeedWithLlm } from "./llm";
import type {
  ForYouCarouselDef,
  ForYouFeedPayload,
  ForYouIdentity,
  StoredFeed,
} from "./types";

// ============================================================
// For You feed orchestrator
// ============================================================
// getForYouFeed(): cache → deterministic build. Never calls the LLM, so the
// first render is always fast.
// enhanceForYouFeed(): background LLM pass over the stored candidate pool.

const DETERMINISTIC_TTL_MS = 10 * 60 * 1000;
const LLM_TTL_MS = 45 * 60 * 1000;
const MAX_STORED_CANDIDATES = 400;
const MIN_CAROUSEL_ITEMS = 4;

interface FeedRow {
  id: string;
  feed: StoredFeed;
  candidate_ids: string[];
  source: "deterministic" | "llm";
  created_at: string;
  expires_at: string;
}

function identityFilter(identity: ForYouIdentity): { column: string; value: string } | null {
  if (identity.userId) return { column: "user_id", value: identity.userId };
  if (identity.anonymousId) return { column: "anonymous_id", value: identity.anonymousId };
  return null;
}

async function readCachedFeed(identity: ForYouIdentity): Promise<FeedRow | null> {
  const filter = identityFilter(identity);
  if (!filter) return null;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("for_you_feeds")
      .select("id, feed, candidate_ids, source, created_at, expires_at")
      .eq(filter.column, filter.value)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(2);

    if (error || !data || data.length === 0) return null;
    // Prefer an LLM-enhanced feed when both are fresh.
    return (data.find((row) => row.source === "llm") || data[0]) as FeedRow;
  } catch {
    return null;
  }
}

async function writeFeed(
  identity: ForYouIdentity,
  stored: StoredFeed,
  candidateIds: string[],
  source: "deterministic" | "llm",
  model?: string,
): Promise<string> {
  const feedId = randomUUID();
  const filter = identityFilter(identity);
  if (!filter) return feedId;

  try {
    const supabase = createServiceRoleClient();
    await supabase.from("for_you_feeds").insert({
      id: feedId,
      [filter.column]: filter.value,
      feed: stored,
      candidate_ids: candidateIds.slice(0, MAX_STORED_CANDIDATES),
      source,
      model: model || null,
      expires_at: new Date(
        Date.now() + (source === "llm" ? LLM_TTL_MS : DETERMINISTIC_TTL_MS),
      ).toISOString(),
    });

    // Keep the table tidy: drop this identity's older rows.
    await supabase
      .from("for_you_feeds")
      .delete()
      .eq(filter.column, filter.value)
      .neq("id", feedId)
      .lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString());
  } catch (error) {
    console.error("[for-you] failed to cache feed:", error);
  }
  return feedId;
}

/**
 * Hydrate carousel product IDs against live inventory. Unavailable products
 * are dropped; carousels falling under the minimum are removed.
 */
function hydrateCarousels(
  carousels: ForYouCarouselDef[],
  liveRows: Map<string, PublicMarketplaceCardRow>,
) {
  return carousels
    .map((carousel) => {
      const products = carousel.productIds
        .map((id) => liveRows.get(id))
        .filter((row): row is PublicMarketplaceCardRow => !!row)
        .map(transformPublicMarketplaceCard)
        .filter((product) => !!product.primary_image_url);
      return {
        key: carousel.key,
        title: carousel.title,
        explanation: carousel.explanation,
        source: carousel.source,
        products,
      };
    })
    .filter(
      (carousel) =>
        carousel.products.length >= (carousel.key === "recently-viewed" ? 3 : MIN_CAROUSEL_ITEMS),
    );
}

async function buildFreshFeed(identity: ForYouIdentity): Promise<ForYouFeedPayload> {
  const signals = await collectSignals(identity);
  const candidates = await fetchCandidates(signals);

  const { carousels, personalised } = buildDeterministicFeed(signals, candidates);
  const summary = buildLlmSummary(signals, candidates);
  const stored: StoredFeed = { carousels, summary, personalised };

  const candidateIds = [...candidates.keys()];
  const feedId = await writeFeed(identity, stored, candidateIds, "deterministic");

  // Snapshot inferred preferences in the background — never blocks the feed.
  void persistPreferenceProfile(identity, signals).catch(() => {});

  const liveRows = new Map([...candidates.entries()].map(([id, c]) => [id, c.row]));
  return {
    feedId,
    carousels: hydrateCarousels(carousels, liveRows),
    personalised,
    source: "deterministic",
    generatedAt: new Date().toISOString(),
    enhanceable: carousels.length > 0,
  };
}

export async function getForYouFeed(
  identity: ForYouIdentity,
  options: { forceRefresh?: boolean } = {},
): Promise<ForYouFeedPayload> {
  if (!options.forceRefresh) {
    const cached = await readCachedFeed(identity);
    if (cached?.feed?.carousels?.length) {
      const allIds = [...new Set(cached.feed.carousels.flatMap((c) => c.productIds))];
      const liveRows = await validateProductIds(allIds);
      const carousels = hydrateCarousels(cached.feed.carousels, liveRows);

      // If availability churn gutted the cached feed, rebuild instead.
      const liveCount = carousels.reduce((sum, c) => sum + c.products.length, 0);
      if (carousels.length >= 3 && liveCount >= allIds.length * 0.5) {
        return {
          feedId: cached.id,
          carousels,
          personalised: cached.feed.personalised,
          source: cached.source,
          generatedAt: cached.created_at,
          enhanceable: cached.source === "deterministic",
        };
      }
    }
  }

  return buildFreshFeed(identity);
}

/**
 * Background LLM pass. Loads the stored feed + candidate pool, asks the model
 * to regroup/retitle/rerank, validates hard, caches and returns the result.
 * Returns null on any failure — callers keep the deterministic feed.
 */
export async function enhanceForYouFeed(
  identity: ForYouIdentity,
  feedId: string,
): Promise<ForYouFeedPayload | null> {
  const filter = identityFilter(identity);
  if (!filter) return null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("for_you_feeds")
    .select("id, feed, candidate_ids, source, created_at, expires_at")
    .eq("id", feedId)
    .eq(filter.column, filter.value) // identity must own the feed
    .maybeSingle();

  if (error || !data) return null;
  const row = data as FeedRow;
  if (row.source === "llm") return null; // already enhanced

  // Revalidate the candidate pool against live inventory before the LLM sees it.
  const liveRows = await validateProductIds(row.candidate_ids || []);
  if (liveRows.size === 0) return null;

  const liveCarousels = row.feed.carousels
    .map((c) => ({ ...c, productIds: c.productIds.filter((id) => liveRows.has(id)) }))
    .filter((c) => c.productIds.length > 0);

  const enhanced = await enhanceFeedWithLlm(row.feed.summary, liveCarousels, liveRows);
  if (!enhanced) return null;

  const stored: StoredFeed = {
    carousels: enhanced.carousels,
    summary: row.feed.summary,
    personalised: row.feed.personalised,
  };
  const newFeedId = await writeFeed(
    identity,
    stored,
    [...liveRows.keys()],
    "llm",
    enhanced.model,
  );

  return {
    feedId: newFeedId,
    carousels: hydrateCarousels(enhanced.carousels, liveRows),
    personalised: row.feed.personalised,
    source: "llm",
    generatedAt: new Date().toISOString(),
    enhanceable: false,
  };
}
