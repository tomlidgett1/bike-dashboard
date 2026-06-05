import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
} from '@/lib/marketplace/public-card-feed';

// ============================================================
// Marketplace Store Categories API
// Returns distinct Lightspeed category names from all active
// bike store products — used to populate the Bike Stores tab
// category pills on the marketplace homepage.
// Mirrors the category-counts pattern but for category_name.
// ============================================================

export const revalidate = 300; // ISR: revalidate every 5 minutes

export async function GET(request: NextRequest) {
  const uberOnly = request.nextUrl.searchParams.get('uberOnly') === 'true';

  try {
    const supabase = createPublicSupabaseClient();

    let cardsQuery = supabase
      .from('public_marketplace_cards')
      .select('category_name')
      .eq('listing_type', 'store_inventory')
      .eq('is_verified_bike_store', true)
      .not('category_name', 'is', null);

    if (uberOnly) {
      cardsQuery = cardsQuery.eq('uber_delivery_enabled', true);
    }

    const { data: cardData, error: cardError } = await cardsQuery;

    if (!cardError && cardData) {
      const counts = new Map<string, number>();
      for (const row of cardData) {
        const name = row.category_name as string;
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }

      const categories = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      return NextResponse.json(
        { categories },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            'X-Marketplace-Feed': 'public-cards',
          },
        }
      );
    }

    if (cardError && !hasMissingPublicCardFeedError(cardError)) {
      console.warn('[store-categories] public card feed failed, falling back:', cardError.message);
    }

    // Query all active Lightspeed products that have a category_name set.
    // Uses the same filters as category-counts so the product population matches.
    let query = supabase
      .from('products')
      .select('category_name')
      .eq('is_active', true)
      .eq('listing_source', 'lightspeed')
      .or('listing_status.is.null,listing_status.eq.active')
      .not('category_name', 'is', null);

    if (uberOnly) {
      query = query.eq('uber_delivery_enabled', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[store-categories] Query error:', error);
      return NextResponse.json({ categories: [] }, { status: 200 });
    }

    // Aggregate counts per category name
    const counts = new Map<string, number>();
    for (const row of data || []) {
      const name = row.category_name as string;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    const categories = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json(
      { categories },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (err) {
    console.error('[store-categories] Unexpected error:', err);
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
