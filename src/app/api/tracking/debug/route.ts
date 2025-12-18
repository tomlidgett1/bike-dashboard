/**
 * Debug Endpoint for Tracking System
 * 
 * GET /api/tracking/debug
 * Returns diagnostic information about the tracking system
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const results: any = {
      timestamp: new Date().toISOString(),
      checks: [],
    };

    // Check 1: Database connection
    try {
      const { error: connError } = await supabase.from('products').select('id').limit(1);
      results.checks.push({
        name: 'Database Connection',
        status: connError ? 'FAIL' : 'PASS',
        message: connError ? connError.message : 'Connected successfully',
      });
    } catch (error) {
      results.checks.push({
        name: 'Database Connection',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Check 2: user_interactions table exists
    try {
      const { error: tableError } = await supabase
        .from('user_interactions')
        .select('id')
        .limit(1);
      
      results.checks.push({
        name: 'user_interactions Table',
        status: tableError ? 'FAIL' : 'PASS',
        message: tableError ? tableError.message : 'Table exists and accessible',
        hint: tableError?.hint || null,
      });
    } catch (error) {
      results.checks.push({
        name: 'user_interactions Table',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Check 3: product_scores table exists
    try {
      const { error: scoresError } = await supabase
        .from('product_scores')
        .select('product_id')
        .limit(1);
      
      results.checks.push({
        name: 'product_scores Table',
        status: scoresError ? 'FAIL' : 'PASS',
        message: scoresError ? scoresError.message : 'Table exists and accessible',
      });
    } catch (error) {
      results.checks.push({
        name: 'product_scores Table',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Check 4: Try inserting a test interaction
    try {
      const { data: testProduct } = await supabase
        .from('products')
        .select('id')
        .limit(1)
        .single();

      if (!testProduct) {
        results.checks.push({
          name: 'Test Insert',
          status: 'SKIP',
          message: 'No products available for testing',
        });
      } else {
        const { error: insertError } = await supabase
          .from('user_interactions')
          .insert({
            session_id: crypto.randomUUID(),
            product_id: testProduct.id,
            interaction_type: 'view',
            metadata: { test: true, source: 'debug_endpoint' },
            created_at: new Date().toISOString(),
          });

        results.checks.push({
          name: 'Test Insert',
          status: insertError ? 'FAIL' : 'PASS',
          message: insertError ? insertError.message : 'Successfully inserted test interaction',
          details: insertError ? {
            code: insertError.code,
            hint: insertError.hint,
          } : null,
        });

        // Clean up test interaction
        if (!insertError) {
          await supabase
            .from('user_interactions')
            .delete()
            .eq('product_id', testProduct.id)
            .eq('metadata->test', true);
        }
      }
    } catch (error) {
      results.checks.push({
        name: 'Test Insert',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Check 5: increment_product_score function exists
    try {
      const { data: testProduct } = await supabase
        .from('products')
        .select('id')
        .limit(1)
        .single();

      if (testProduct) {
        const { error: funcError } = await supabase.rpc('increment_product_score', {
          p_product_id: testProduct.id,
          p_interaction_type: 'view',
        });

        results.checks.push({
          name: 'increment_product_score Function',
          status: funcError ? 'FAIL' : 'PASS',
          message: funcError ? funcError.message : 'Function exists and works',
        });
      }
    } catch (error) {
      results.checks.push({
        name: 'increment_product_score Function',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Check 6: Count existing data
    try {
      const [interactionsResult, scoresResult, prefsResult] = await Promise.all([
        supabase.from('user_interactions').select('id', { count: 'exact', head: true }),
        supabase.from('product_scores').select('product_id', { count: 'exact', head: true }),
        supabase.from('user_preferences').select('user_id', { count: 'exact', head: true }),
      ]);

      results.data_counts = {
        interactions: interactionsResult.count || 0,
        product_scores: scoresResult.count || 0,
        user_preferences: prefsResult.count || 0,
      };
    } catch (error) {
      results.data_counts = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Summary
    const failedChecks = results.checks.filter((c: any) => c.status === 'FAIL');
    results.summary = {
      total_checks: results.checks.length,
      passed: results.checks.filter((c: any) => c.status === 'PASS').length,
      failed: failedChecks.length,
      status: failedChecks.length === 0 ? 'HEALTHY' : 'UNHEALTHY',
    };

    // Recommendations
    if (failedChecks.length > 0) {
      results.recommendations = [];
      
      if (failedChecks.some((c: any) => c.name.includes('Table'))) {
        results.recommendations.push('Run: supabase db push (to create tables)');
      }
      
      if (failedChecks.some((c: any) => c.message?.includes('permission'))) {
        results.recommendations.push('Check RLS policies in Supabase dashboard');
      }
      
      if (failedChecks.some((c: any) => c.message?.includes('partition'))) {
        results.recommendations.push('Create monthly partition for user_interactions table');
      }
    }

    return NextResponse.json(results);

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Debug endpoint failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}











