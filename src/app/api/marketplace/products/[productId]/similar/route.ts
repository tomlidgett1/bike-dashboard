import { NextRequest, NextResponse } from 'next/server';
import {
  fetchSimilarProductSource,
  getLlmSimilarProducts,
  getRuleBasedSimilarProducts,
} from '@/lib/marketplace/llm-similar-products';

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
      // Same candidate pool + last-resort fill as the LLM path (never stricter).
      const products = await getRuleBasedSimilarProducts(source, limit);

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
