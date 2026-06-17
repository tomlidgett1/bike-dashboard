import {
  createPublicSupabaseClient,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import type { LandingProductFilters } from "@/lib/seo/landing-pages";

const DEFAULT_LIMIT = 24;

function buildSearchOr(terms: string[]): string {
  const clauses: string[] = [];
  for (const term of terms) {
    const safe = term.replace(/[%_]/g, "");
    if (!safe) continue;
    clauses.push(`display_name.ilike.%${safe}%`);
    clauses.push(`description.ilike.%${safe}%`);
  }
  return clauses.join(",");
}

async function queryProducts(
  filters: LandingProductFilters,
  limit: number,
): Promise<MarketplaceProduct[]> {
  try {
    const supabase = createPublicSupabaseClient();
    let query = supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .or("listing_status.is.null,listing_status.eq.active")
      .not("resolved_image_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filters.listingType) {
      query = query.eq("listing_type", filters.listingType);
    }

    if (filters.level1) {
      query = query.eq("marketplace_category", filters.level1);
    }

    if (filters.location) {
      query = query.ilike("pickup_location", `%${filters.location}%`);
    }

    if (filters.maxPrice != null) {
      query = query.lte("price", filters.maxPrice);
    }

    if (filters.searchTerms?.length) {
      const orClause = buildSearchOr(filters.searchTerms);
      if (orClause) query = query.or(orClause);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as PublicMarketplaceCardRow[]).map(transformPublicMarketplaceCard);
  } catch {
    return [];
  }
}

/** Fetch products for an SEO landing page, with optional local → national fallback. */
export async function fetchLandingProducts(
  filters: LandingProductFilters,
  opts: { limit?: number; location?: string } = {},
): Promise<{ products: MarketplaceProduct[]; hasLocalMatch: boolean }> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const location = opts.location ?? filters.location;

  if (location) {
    const local = await queryProducts({ ...filters, location }, limit);
    if (local.length >= 4) {
      return { products: local, hasLocalMatch: true };
    }

    const national = await queryProducts({ ...filters, location: undefined }, limit);
    return { products: national.length > 0 ? national : local, hasLocalMatch: false };
  }

  const products = await queryProducts(filters, limit);
  return { products, hasLocalMatch: true };
}
