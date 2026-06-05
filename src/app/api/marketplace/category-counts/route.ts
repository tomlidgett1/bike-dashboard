import { NextResponse } from 'next/server';
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
} from '@/lib/marketplace/public-card-feed';

// ============================================================
// Marketplace Category Counts API - Lightweight Aggregation
// Enterprise-grade performance with aggressive caching
// ============================================================

// Enable ISR caching - revalidate every 5 minutes
export const revalidate = 300;

// Deploy to edge runtime for global CDN distribution
export const runtime = 'edge';

function jsonWithCountsCache(
  body: { counts: Record<string, number>; total: number },
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

function aggregateCounts(rows: { marketplace_category: string | null }[]) {
  const counts: Record<string, number> = {};
  rows.forEach((product) => {
    if (product.marketplace_category) {
      counts[product.marketplace_category] = (counts[product.marketplace_category] || 0) + 1;
    }
  });

  return {
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    console.log('📊 [CATEGORY COUNTS] Fetching category aggregations...');

    const supabase = createPublicSupabaseClient();

    const { data: cardData, error: cardError } = await supabase
      .from('public_marketplace_cards')
      .select('marketplace_category')
      .not('marketplace_category', 'is', null);

    if (!cardError && cardData) {
      const totalTime = Date.now() - startTime;
      return jsonWithCountsCache(
        aggregateCounts(cardData as { marketplace_category: string | null }[]),
        totalTime,
        'public-cards',
      );
    }

    if (cardError && !hasMissingPublicCardFeedError(cardError)) {
      console.warn('Category counts public-card feed failed, falling back:', cardError.message);
    }

    // Use efficient SQL aggregation instead of fetching all products
    // This query runs in ~5ms vs ~500ms for fetching 10K products
    const { data, error } = await supabase
      .rpc('get_marketplace_category_counts');

    if (error) {
      console.error('Category counts RPC error:', error);
      // Fallback to direct query if RPC doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('products')
        .select('marketplace_category')
        .eq('is_active', true)
        .or('listing_status.is.null,listing_status.eq.active');

      if (fallbackError) {
        throw fallbackError;
      }

      // Manual aggregation
      const countsResponse = aggregateCounts((fallbackData || []) as { marketplace_category: string | null }[]);

      const totalTime = Date.now() - startTime;
      console.log(`✅ [CATEGORY COUNTS] Completed in ${totalTime}ms (fallback mode)`);

      return jsonWithCountsCache(countsResponse, totalTime, 'products-fallback');
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      counts[row.category] = row.count;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const totalTime = Date.now() - startTime;
    
    console.log(`✅ [CATEGORY COUNTS] Completed in ${totalTime}ms`, {
      categories: Object.keys(counts).length,
      total,
    });

    // Aggressive caching: 5 minutes cache, 10 minutes stale-while-revalidate
    return jsonWithCountsCache({ counts, total }, totalTime, 'rpc-fallback');
  } catch (error) {
    console.error('Unexpected error in category counts API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
