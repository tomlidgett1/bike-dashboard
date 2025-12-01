import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// Marketplace Category Counts API - Lightweight Aggregation
// Enterprise-grade performance with aggressive caching
// ============================================================

// Enable ISR caching - revalidate every 5 minutes
export const revalidate = 300;

// Deploy to edge runtime for global CDN distribution
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('📊 [CATEGORY COUNTS] Fetching category aggregations...');

    // Create Supabase client (public access)
    const supabase = await createClient();

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
      const counts: Record<string, number> = {};
      (fallbackData || []).forEach((product: any) => {
        if (product.marketplace_category) {
          counts[product.marketplace_category] = (counts[product.marketplace_category] || 0) + 1;
        }
      });

      const totalTime = Date.now() - startTime;
      console.log(`✅ [CATEGORY COUNTS] Completed in ${totalTime}ms (fallback mode)`);

      return NextResponse.json(
        { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            'CDN-Cache-Control': 'public, s-maxage=300',
            'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
            'X-Response-Time': `${totalTime}ms`,
          },
        }
      );
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
    return NextResponse.json(
      { counts, total },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=300',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
          'X-Response-Time': `${totalTime}ms`,
        },
      }
    );
  } catch (error) {
    console.error('Unexpected error in category counts API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

