/**
 * Trending System Health Check API
 * 
 * Diagnostic endpoint to check the health of the trending products system.
 * Returns counts and status for all components in the data pipeline.
 * 
 * GET /api/marketplace/trending/health
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const startTime = performance.now();
  
  try {
    const supabase = await createClient();
    
    const diagnostics: {
      timestamp: string;
      checks: Array<{
        name: string;
        count: number;
        status: 'PASS' | 'FAIL' | 'WARN';
        details?: string;
      }>;
      summary: {
        status: 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED';
        issues: string[];
        recommendations: string[];
      };
      response_time_ms: number;
    } = {
      timestamp: new Date().toISOString(),
      checks: [],
      summary: {
        status: 'HEALTHY',
        issues: [],
        recommendations: [],
      },
      response_time_ms: 0,
    };

    // Check 1: Total active products
    const { count: totalActiveProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    diagnostics.checks.push({
      name: 'Total Active Products',
      count: totalActiveProducts || 0,
      status: (totalActiveProducts || 0) > 0 ? 'PASS' : 'FAIL',
    });

    // Check 2: Products with score entries
    const { count: productsWithScores } = await supabase
      .from('product_scores')
      .select('*', { count: 'exact', head: true });

    diagnostics.checks.push({
      name: 'Products with Score Entries',
      count: productsWithScores || 0,
      status: (productsWithScores || 0) > 0 ? 'PASS' : 'FAIL',
    });

    // Check 3: Products with trending_score > 0
    const { count: withTrending } = await supabase
      .from('product_scores')
      .select('*', { count: 'exact', head: true })
      .gt('trending_score', 0);

    diagnostics.checks.push({
      name: 'Products with Trending Score > 0',
      count: withTrending || 0,
      status: (withTrending || 0) > 0 ? 'PASS' : 'FAIL',
      details: withTrending === 0 ? 'No products have trending scores - this is why trending page is empty' : undefined,
    });

    // Check 4: Products with Cloudinary images (checking multiple columns)
    const { data: cloudinaryProducts } = await supabase
      .from('products')
      .select('id, primary_image_url, custom_image_url, images, listing_type')
      .eq('is_active', true);

    let cloudinaryCount = 0;
    if (cloudinaryProducts) {
      cloudinaryCount = cloudinaryProducts.filter((product: any) => {
        // Check primary_image_url
        if (product.primary_image_url?.includes('cloudinary')) return true;
        // Check custom_image_url
        if (product.custom_image_url?.includes('cloudinary')) return true;
        // Check images array (for private listings)
        if (Array.isArray(product.images)) {
          return product.images.some((img: any) => 
            img.url?.includes('cloudinary') || img.cloudinaryUrl
          );
        }
        return false;
      }).length;
    }

    diagnostics.checks.push({
      name: 'Products with Cloudinary Images',
      count: cloudinaryCount,
      status: cloudinaryCount > 0 ? 'PASS' : 'FAIL',
      details: cloudinaryCount === 0 ? 'No products have Cloudinary images - required for marketplace display' : undefined,
    });

    // Check 5: Missing score entries (products without product_scores row)
    const { data: missingScoresData } = await supabase
      .rpc('count_missing_product_scores');
    
    // If RPC doesn't exist, do it manually
    let missingScores = 0;
    if (missingScoresData !== null && typeof missingScoresData === 'number') {
      missingScores = missingScoresData;
    } else {
      // Fallback: Get all active product IDs and check which are missing from product_scores
      const { data: activeProducts } = await supabase
        .from('products')
        .select('id')
        .eq('is_active', true);
      
      const { data: scoredProducts } = await supabase
        .from('product_scores')
        .select('product_id');
      
      if (activeProducts && scoredProducts) {
        const scoredIds = new Set(scoredProducts.map(s => s.product_id));
        missingScores = activeProducts.filter(p => !scoredIds.has(p.id)).length;
      }
    }

    diagnostics.checks.push({
      name: 'Products Missing Score Entries',
      count: missingScores,
      status: missingScores === 0 ? 'PASS' : 'WARN',
      details: missingScores > 0 ? `${missingScores} products have no score entry and cannot appear in trending` : undefined,
    });

    // Check 6: Products that could appear in trending (have score > 0 AND cloudinary image)
    // This is the critical intersection
    let trendingCandidates = 0;
    if (cloudinaryProducts && withTrending && withTrending > 0) {
      const { data: trendingScores } = await supabase
        .from('product_scores')
        .select('product_id')
        .gt('trending_score', 0);
      
      if (trendingScores) {
        const trendingIds = new Set(trendingScores.map(s => s.product_id));
        trendingCandidates = cloudinaryProducts.filter((product: any) => {
          if (!trendingIds.has(product.id)) return false;
          // Check for cloudinary image
          if (product.primary_image_url?.includes('cloudinary')) return true;
          if (product.custom_image_url?.includes('cloudinary')) return true;
          if (Array.isArray(product.images)) {
            return product.images.some((img: any) => 
              img.url?.includes('cloudinary') || img.cloudinaryUrl
            );
          }
          return false;
        }).length;
      }
    }

    diagnostics.checks.push({
      name: 'Trending Candidates (Score > 0 + Cloudinary)',
      count: trendingCandidates,
      status: trendingCandidates > 0 ? 'PASS' : 'FAIL',
      details: trendingCandidates === 0 
        ? 'CRITICAL: No products have both a trending score AND a Cloudinary image - this is the root cause' 
        : `${trendingCandidates} products can appear in trending`,
    });

    // Check 7: Sample of top trending scores
    const { data: topTrending } = await supabase
      .from('product_scores')
      .select('product_id, trending_score, view_count, click_count, like_count, last_interaction_at')
      .gt('trending_score', 0)
      .order('trending_score', { ascending: false })
      .limit(5);

    diagnostics.checks.push({
      name: 'Top Trending Products Sample',
      count: topTrending?.length || 0,
      status: (topTrending?.length || 0) > 0 ? 'PASS' : 'WARN',
      details: topTrending && topTrending.length > 0 
        ? `Top score: ${topTrending[0].trending_score}, Views: ${topTrending[0].view_count}, Clicks: ${topTrending[0].click_count}`
        : 'No trending products found',
    });

    // Generate summary
    const failedChecks = diagnostics.checks.filter(c => c.status === 'FAIL');
    const warnChecks = diagnostics.checks.filter(c => c.status === 'WARN');

    if (failedChecks.length > 0) {
      diagnostics.summary.status = 'UNHEALTHY';
      diagnostics.summary.issues = failedChecks.map(c => c.name);
    } else if (warnChecks.length > 0) {
      diagnostics.summary.status = 'DEGRADED';
      diagnostics.summary.issues = warnChecks.map(c => c.name);
    }

    // Add recommendations based on issues
    if (missingScores > 0) {
      diagnostics.summary.recommendations.push(
        'Run bootstrap SQL to create missing product_scores entries'
      );
    }
    if ((withTrending || 0) === 0) {
      diagnostics.summary.recommendations.push(
        'Products have no interactions. Run calculate_popularity_scores() after seeding initial view counts'
      );
    }
    if (cloudinaryCount === 0) {
      diagnostics.summary.recommendations.push(
        'Upload Cloudinary images for products - required for marketplace display'
      );
    }
    if (trendingCandidates === 0 && (withTrending || 0) > 0 && cloudinaryCount > 0) {
      diagnostics.summary.recommendations.push(
        'Products with trending scores do not have Cloudinary images - the two sets do not intersect'
      );
    }

    diagnostics.response_time_ms = Math.round(performance.now() - startTime);

    return NextResponse.json(diagnostics);

  } catch (error) {
    console.error('[Trending Health] Error:', error);
    return NextResponse.json(
      { 
        error: 'Health check failed', 
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
