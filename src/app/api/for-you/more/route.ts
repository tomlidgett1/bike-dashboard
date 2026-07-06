import { NextRequest, NextResponse } from "next/server";
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";
import { isCyclingMarketplaceRow } from "@/lib/for-you/cycling-filter";
import { seededShuffle } from "@/lib/marketplace/store-feed-order";

// ============================================================
// GET /api/for-you/more — endless-scroll pages for the For You feed
// ============================================================
// Blends the user's demonstrated taste (carousel categories) with wider
// discovery inventory. The whole sequence is deterministic for a given
// seed + exclude set, so successive pages within one session are disjoint:
// page N is simply slice N of the same seeded ordering.

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
const MAX_PAGE = 60;
const PREFERRED_POOL_PER_CATEGORY = 120;
const DISCOVERY_POOL = 300;
const MAX_CATEGORIES = 5;
const MAX_EXCLUDE_IDS = 300;
const ACTIVE_FILTER = "listing_status.is.null,listing_status.eq.active";

/** Two preferred picks, then one discovery pick — personal but never samey. */
function interleavePools(
  preferred: PublicMarketplaceCardRow[],
  discovery: PublicMarketplaceCardRow[],
): PublicMarketplaceCardRow[] {
  const sequence: PublicMarketplaceCardRow[] = [];
  let p = 0;
  let d = 0;

  while (p < preferred.length || d < discovery.length) {
    if (p < preferred.length) sequence.push(preferred[p++]);
    if (p < preferred.length) sequence.push(preferred[p++]);
    if (d < discovery.length) sequence.push(discovery[d++]);
  }

  return sequence;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const page = Math.min(
      Math.max(Number.parseInt(searchParams.get("page") || "1", 10) || 1, 1),
      MAX_PAGE,
    );
    const seed = (searchParams.get("seed") || "for-you").slice(0, 80);
    const categories = (searchParams.get("categories") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, MAX_CATEGORIES);
    const exclude = new Set(
      (searchParams.get("exclude") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, MAX_EXCLUDE_IDS),
    );

    const supabase = createPublicSupabaseClient();

    const baseQuery = () =>
      supabase
        .from("public_marketplace_cards")
        .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
        .or(ACTIVE_FILTER)
        .not("resolved_image_id", "is", null)
        .order("created_at", { ascending: false });

    const [discoveryResult, ...preferredResults] = await Promise.all([
      baseQuery().limit(DISCOVERY_POOL),
      ...categories.map((category) =>
        baseQuery()
          .eq("marketplace_category", category)
          .limit(PREFERRED_POOL_PER_CATEGORY),
      ),
    ]);

    const usable = (rows: PublicMarketplaceCardRow[] | null | undefined, seen: Set<string>) =>
      (rows || []).filter((row) => {
        if (!row.id || seen.has(row.id) || exclude.has(row.id)) return false;
        if (!isCyclingMarketplaceRow(row)) return false;
        seen.add(row.id);
        return true;
      });

    const seenIds = new Set<string>();
    const preferredRows: PublicMarketplaceCardRow[] = [];
    for (const result of preferredResults) {
      if (result.error && !hasMissingPublicCardFeedError(result.error)) {
        console.warn("[for-you/more] preferred pool failed:", result.error.message);
        continue;
      }
      preferredRows.push(...usable(result.data as PublicMarketplaceCardRow[], seenIds));
    }

    if (discoveryResult.error && !hasMissingPublicCardFeedError(discoveryResult.error)) {
      console.warn("[for-you/more] discovery pool failed:", discoveryResult.error.message);
    }
    const discoveryRows = usable(
      discoveryResult.data as PublicMarketplaceCardRow[],
      seenIds,
    );

    const sequence = interleavePools(
      seededShuffle(preferredRows, `${seed}:preferred`),
      seededShuffle(discoveryRows, `${seed}:discovery`),
    );

    const start = (page - 1) * PAGE_SIZE;
    const products = sequence
      .slice(start, start + PAGE_SIZE)
      .map(transformPublicMarketplaceCard)
      .filter((product) => !!product.primary_image_url);

    return NextResponse.json(
      {
        success: true,
        products,
        page,
        hasMore: sequence.length > start + PAGE_SIZE,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[for-you/more] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load more products" },
      { status: 500 },
    );
  }
}
