/**
 * Simple Recommendations Test
 * Returns detailed debug info in the response
 * GET /api/recommendations/simple-test
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTrendingProducts, getPopularProducts } from '@/lib/recommendations/algorithms';

export async function GET() {
  try {
    const supabase = await createClient();
    const results: any = {
      timestamp: new Date().toISOString(),
      steps: [],
    };

    // Step 1: Check product_scores
    const { data: scores } = await supabase
      .from('product_scores')
      .select('product_id, trending_score, popularity_score')
      .gt('trending_score', 0)
      .order('trending_score', { ascending: false })
      .limit(10);

    results.steps.push({
      step: 1,
      name: 'Query product_scores directly',
      count: scores?.length || 0,
      sample: scores?.[0] || null,
      status: (scores?.length || 0) > 0 ? 'PASS' : 'FAIL',
    });

    // Step 2: Try getTrendingProducts algorithm
    const trendingResult = await getTrendingProducts(supabase, { limit: 10 });
    
    results.steps.push({
      step: 2,
      name: 'getTrendingProducts algorithm',
      count: trendingResult.productIds.length,
      algorithm: trendingResult.algorithm,
      score: trendingResult.score,
      sample_ids: trendingResult.productIds.slice(0, 3),
      status: trendingResult.productIds.length > 0 ? 'PASS' : 'FAIL',
    });

    // Step 3: Try getPopularProducts algorithm
    const popularResult = await getPopularProducts(supabase, { limit: 10 });
    
    results.steps.push({
      step: 3,
      name: 'getPopularProducts algorithm',
      count: popularResult.productIds.length,
      algorithm: popularResult.algorithm,
      score: popularResult.score,
      sample_ids: popularResult.productIds.slice(0, 3),
      status: popularResult.productIds.length > 0 ? 'PASS' : 'FAIL',
    });

    // Step 4: Try enriching one product
    if (trendingResult.productIds.length > 0) {
      const { data: enriched } = await supabase
        .from('products')
        .select(`
          id,
          description,
          price,
          is_active
        `)
        .eq('id', trendingResult.productIds[0])
        .single();

      results.steps.push({
        step: 4,
        name: 'Enrich product data',
        product: enriched || null,
        status: enriched ? 'PASS' : 'FAIL',
      });
    }

    // Summary
    const failedSteps = results.steps.filter((s: any) => s.status === 'FAIL');
    results.summary = {
      total_steps: results.steps.length,
      passed: results.steps.filter((s: any) => s.status === 'PASS').length,
      failed: failedSteps.length,
      status: failedSteps.length === 0 ? 'HEALTHY' : 'UNHEALTHY',
    };

    if (failedSteps.length > 0) {
      results.diagnosis = 'Some algorithms are not returning products. Check the failed steps above.';
    } else {
      results.diagnosis = 'All algorithms work! The issue might be in generateHybridRecommendations or enrichProducts.';
    }

    return NextResponse.json(results);

  } catch (error) {
    return NextResponse.json({
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}





