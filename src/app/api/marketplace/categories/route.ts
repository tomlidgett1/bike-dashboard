import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
} from '@/lib/marketplace/public-card-feed';
import { buildStaticCategoryHierarchy } from '@/lib/marketplace/canonical-taxonomy';

// ============================================================
// Marketplace Categories API - Public Endpoint
// Returns the full canonical Yellow Jersey L1/L2/L3 hierarchy
// with live product counts overlaid when available.
// ============================================================

export const revalidate = 300;
export const runtime = 'edge';

interface MarketplaceCategoryRow {
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  marketplace_level_3_category: string | null;
}

function jsonWithCategoryCache(
  body: { categories: ReturnType<typeof buildStaticCategoryHierarchy>; totalProducts: number },
  totalTime: number,
  feed: string,
) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'CDN-Cache-Control': 'public, s-maxage=300',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
      'X-Response-Time': `${totalTime}ms`,
      'X-Marketplace-Feed': feed,
    },
  });
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const supabase = createPublicSupabaseClient();
    const { searchParams } = new URL(request.url);
    const listingType = searchParams.get('listingType');
    const source = searchParams.get('source'); // 'taxonomy' | 'live' | null

    let cardQuery = supabase
      .from('public_marketplace_cards')
      .select('marketplace_category, marketplace_subcategory, marketplace_level_3_category')
      .not('marketplace_category', 'is', null)
      .not('marketplace_subcategory', 'is', null);

    if (listingType === 'store_inventory') {
      cardQuery = cardQuery
        .eq('listing_type', 'store_inventory')
        .eq('is_verified_bike_store', true);
    } else if (listingType === 'private_listing') {
      cardQuery = cardQuery.eq('listing_type', 'private_listing');
    }

    const { data: cardProducts, error: cardError } = await cardQuery;
    let countRows: MarketplaceCategoryRow[] = [];

    if (!cardError && cardProducts) {
      countRows = cardProducts as MarketplaceCategoryRow[];
    } else if (cardError && !hasMissingPublicCardFeedError(cardError)) {
      console.warn('Public card category feed failed, falling back:', cardError.message);
    }

    if (countRows.length === 0) {
      let query = supabase
        .from('products')
        .select('marketplace_category, marketplace_subcategory, marketplace_level_3_category')
        .eq('is_active', true)
        .not('marketplace_category', 'is', null)
        .not('marketplace_subcategory', 'is', null);

      if (listingType === 'store_inventory' || listingType === 'private_listing') {
        query = query.eq('listing_type', listingType);
      }

      const { data: products, error } = await query;
      if (error) {
        console.error('Error fetching category stats:', error);
      } else {
        countRows = (products || []) as MarketplaceCategoryRow[];
      }
    }

    const hierarchy = buildStaticCategoryHierarchy(countRows);

    // Default: full Yellow Jersey tree (every L1 + L2), including empty nodes.
    // Live-only mode filters to categories that currently have products.
    if (source === 'live') {
      return jsonWithCategoryCache(
        {
          categories: hierarchy.filter((category) => category.totalProducts > 0),
          totalProducts: countRows.length,
        },
        Date.now() - startTime,
        'live-products',
      );
    }

    return jsonWithCategoryCache(
      {
        categories: hierarchy,
        totalProducts: countRows.length,
      },
      Date.now() - startTime,
      'static-taxonomy',
    );
  } catch (error) {
    console.error('Unexpected error in categories API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
