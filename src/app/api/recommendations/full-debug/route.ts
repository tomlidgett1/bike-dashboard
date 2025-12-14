/**
 * Full Debug Test - Shows ALL debug info in response
 * No need to check server logs!
 * GET /api/recommendations/full-debug
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { 
  getTrendingProducts, 
  getPopularProducts,
  getCategoryBasedRecommendations,
  getSimilarProducts,
  getCollaborativeRecommendations 
} from '@/lib/recommendations/algorithms';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    const debug: any = {
      user_id: user?.id || 'anonymous',
      timestamp: new Date().toISOString(),
      tests: [],
    };

    // Test 1: Product scores exist
    const { data: scoresCheck } = await supabase
      .from('product_scores')
      .select('product_id, trending_score, popularity_score')
      .gt('trending_score', 0)
      .limit(5);

    debug.tests.push({
      test: 'Product Scores Query',
      count: scoresCheck?.length || 0,
      sample: scoresCheck?.[0] || null,
    });

    // Test 2: Trending algorithm
    const trendingResult = await getTrendingProducts(supabase, { limit: 20 });
    debug.tests.push({
      test: 'getTrendingProducts',
      count: trendingResult.productIds.length,
      sample_ids: trendingResult.productIds.slice(0, 5),
    });

    // Test 3: Popular algorithm
    const popularResult = await getPopularProducts(supabase, { limit: 20 });
    debug.tests.push({
      test: 'getPopularProducts',
      count: popularResult.productIds.length,
      sample_ids: popularResult.productIds.slice(0, 5),
    });

    // Test 4: Personalized algorithms (if user logged in)
    if (user?.id) {
      const categoryResult = await getCategoryBasedRecommendations(supabase, user.id, { limit: 20 });
      debug.tests.push({
        test: 'getCategoryBasedRecommendations',
        count: categoryResult.productIds.length,
        sample_ids: categoryResult.productIds.slice(0, 5),
      });

      const similarResult = await getSimilarProducts(supabase, user.id, { limit: 20 });
      debug.tests.push({
        test: 'getSimilarProducts',
        count: similarResult.productIds.length,
        sample_ids: similarResult.productIds.slice(0, 5),
      });

      const collabResult = await getCollaborativeRecommendations(supabase, user.id, { limit: 20 });
      debug.tests.push({
        test: 'getCollaborativeRecommendations',
        count: collabResult.productIds.length,
        sample_ids: collabResult.productIds.slice(0, 5),
      });
    }

    // Test 5: Combine all results (simulate hybrid)
    const allIds = new Set<string>();
    const allResults = [trendingResult, popularResult];
    
    allResults.forEach(result => {
      result.productIds.forEach(id => allIds.add(id));
    });

    debug.tests.push({
      test: 'Combined Product IDs',
      count: allIds.size,
      sample_ids: Array.from(allIds).slice(0, 5),
    });

    // Test 6: Enrich products
    const idsToEnrich = Array.from(allIds).slice(0, 10);
    const { data: enriched, error: enrichError } = await supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        price,
        primary_image_url,
        marketplace_category,
        user_id,
        is_active
      `)
      .in('id', idsToEnrich)
      .eq('is_active', true);

    debug.tests.push({
      test: 'Enrich Products',
      input_ids: idsToEnrich.length,
      output_products: enriched?.length || 0,
      error: enrichError?.message || null,
      sample: enriched?.[0] || null,
    });

    // Summary
    debug.summary = {
      all_algorithms_work: debug.tests.every((t: any) => t.count > 0 || t.output_products > 0),
      total_unique_products: allIds.size,
      enriched_products: enriched?.length || 0,
    };

    // Diagnosis
    if (allIds.size > 0 && (enriched?.length || 0) === 0) {
      debug.diagnosis = 'Algorithms return IDs but enrichment returns 0 products. Check if products are active.';
    } else if (allIds.size > 0 && (enriched?.length || 0) > 0) {
      debug.diagnosis = '✅ Everything works! Issue might be in the for-you API route or frontend.';
    } else {
      debug.diagnosis = 'Algorithms are not returning any product IDs.';
    }

    return NextResponse.json(debug, { status: 200 });

  } catch (error) {
    return NextResponse.json({
      error: 'Full debug failed',
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : null,
    }, { status: 500 });
  }
}










