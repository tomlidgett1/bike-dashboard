import { NextRequest, NextResponse } from 'next/server';
import {
  fetchSimilarProductSource,
  getLlmSimilarProducts,
  isCompatibleSimilarCandidate,
  scoreSimilarProductsRuleBased,
} from '@/lib/marketplace/llm-similar-products';
import {
  createPublicSupabaseClient,
  hasMissingPublicCardFeedError,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed';

// ============================================================
// Similar Products API
// LLM-ranked similarity (gpt-5.4-nano) with rule-based fallback
// ============================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function cacheHeaders(startTime: number, feed: string) {
  const maxAge = feed === 'llm' ? 120 : 60;
  return {
    'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=300`,
    'CDN-Cache-Control': `public, s-maxage=${maxAge}`,
    'Vercel-CDN-Cache-Control': `public, s-maxage=${maxAge}`,
    'Vary': 'Accept-Encoding',
    'X-Response-Time': `${Date.now() - startTime}ms`,
    'X-Marketplace-Feed': feed,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const startTime = Date.now();

  try {
    const { productId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '12', 10), 24);
    const mode = searchParams.get('mode') || 'llm';

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    const source = await fetchSimilarProductSource(productId);
    if (!source) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (mode === 'rules') {
      const supabase = createPublicSupabaseClient();
      let query = supabase
        .from('public_marketplace_cards')
        .select(PUBLIC_MARKETPLACE_CARD_FIELDS)
        .neq('id', productId)
        .order('created_at', { ascending: false })
        .limit(120);

      if (source.marketplace_category) {
        query = query.eq('marketplace_category', source.marketplace_category);
      }

      const { data: rows, error } = await query;
      if (hasMissingPublicCardFeedError(error)) {
        return NextResponse.json({ products: [], count: 0 }, { headers: cacheHeaders(startTime, 'rules') });
      }

      const products = scoreSimilarProductsRuleBased(
        source,
        ((rows || []) as PublicMarketplaceCardRow[]).filter((row) =>
          isCompatibleSimilarCandidate(source, row),
        ),
        limit,
      );

      return NextResponse.json(
        {
          products,
          count: products.length,
          method: 'rules',
          sourceCategory: source.marketplace_category,
          sourceSubcategory: source.marketplace_subcategory,
        },
        { headers: cacheHeaders(startTime, 'rules') },
      );
    }

    const { products, method } = await getLlmSimilarProducts(source, limit);

    return NextResponse.json(
      {
        products,
        count: products.length,
        method,
        sourceCategory: source.marketplace_category,
        sourceSubcategory: source.marketplace_subcategory,
      },
      { headers: cacheHeaders(startTime, method) },
    );
  } catch (error) {
    console.error('❌ [SIMILAR API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
