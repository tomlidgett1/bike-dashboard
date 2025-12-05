/**
 * Debug Recommendations API
 * GET /api/recommendations/debug
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const debug: any = {
      user_id: user?.id || 'anonymous',
      timestamp: new Date().toISOString(),
      checks: [],
    };

    // Check 1: Products exist
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    debug.checks.push({
      name: 'Active Products',
      count: productCount || 0,
      status: (productCount || 0) > 0 ? 'PASS' : 'FAIL',
    });

    // Check 2: Product scores exist
    const { count: scoresCount } = await supabase
      .from('product_scores')
      .select('*', { count: 'exact', head: true });

    debug.checks.push({
      name: 'Product Scores',
      count: scoresCount || 0,
      status: (scoresCount || 0) > 0 ? 'PASS' : 'FAIL',
    });

    // Check 3: Trending scores exist
    const { data: trendingCheck } = await supabase
      .from('product_scores')
      .select('trending_score')
      .gt('trending_score', 0)
      .limit(1);

    debug.checks.push({
      name: 'Products with Trending Score',
      has_data: (trendingCheck?.length || 0) > 0,
      status: (trendingCheck?.length || 0) > 0 ? 'PASS' : 'FAIL',
    });

    // Check 4: Try fetching trending products directly
    const { data: trendingProducts, error: trendingError } = await supabase
      .from('products')
      .select(`
        id,
        description,
        product_scores!left (
          trending_score
        )
      `)
      .eq('is_active', true)
      .not('product_scores.trending_score', 'is', null)
      .limit(5);

    debug.checks.push({
      name: 'Direct Trending Query',
      count: trendingProducts?.length || 0,
      error: trendingError?.message || null,
      status: (trendingProducts?.length || 0) > 0 ? 'PASS' : 'FAIL',
      sample: trendingProducts?.[0] || null,
    });

    // Check 5: Try simple join
    const { data: joinTest, error: joinError } = await supabase
      .from('products')
      .select('id, description, is_active')
      .eq('is_active', true)
      .limit(5);

    debug.checks.push({
      name: 'Simple Products Query',
      count: joinTest?.length || 0,
      error: joinError?.message || null,
      status: (joinTest?.length || 0) > 0 ? 'PASS' : 'FAIL',
    });

    // Check 6: User interactions
    if (user?.id) {
      const { count: interactionCount } = await supabase
        .from('user_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      debug.checks.push({
        name: 'User Interactions',
        count: interactionCount || 0,
        status: 'INFO',
      });
    }

    // Summary
    const failedChecks = debug.checks.filter((c: any) => c.status === 'FAIL');
    debug.summary = {
      total: debug.checks.length,
      passed: debug.checks.filter((c: any) => c.status === 'PASS').length,
      failed: failedChecks.length,
      status: failedChecks.length === 0 ? 'HEALTHY' : 'UNHEALTHY',
    };

    return NextResponse.json(debug);
  } catch (error) {
    return NextResponse.json({
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}



