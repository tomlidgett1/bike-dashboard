import {
  createPublicSupabaseClient,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from "@/lib/marketplace/public-card-feed";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// Newest used (private-listing) products for the /used-bikes hubs. Optionally
// filtered by a free-text location fragment (e.g. a state code "VIC") since
// listing locations are suburb-level free text. Cookie-free → ISR-compatible.
export async function fetchUsedProducts(
  opts: { location?: string; limit?: number } = {},
): Promise<MarketplaceProduct[]> {
  try {
    const supabase = createPublicSupabaseClient();
    let query = supabase
      .from("public_marketplace_cards")
      .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
      .eq("listing_type", "private_listing")
      .or("listing_status.is.null,listing_status.eq.active")
      .not("resolved_image_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 24);

    if (opts.location) {
      query = query.ilike("pickup_location", `%${opts.location}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as PublicMarketplaceCardRow[]).map(transformPublicMarketplaceCard);
  } catch {
    return [];
  }
}
