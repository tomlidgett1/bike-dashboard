/**
 * E-Commerce Hero Process API
 * POST /api/admin/ecommerce-hero/process
 * 
 * Triggers the queue processing edge function
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Parse optional batch size from request body
    let batchSize = 5;
    try {
      const body = await request.json();
      if (body.batchSize && typeof body.batchSize === 'number') {
        batchSize = Math.min(Math.max(body.batchSize, 1), 10);
      }
    } catch {
      // No body, use defaults
    }

    console.log(`[ECOMMERCE-HERO PROCESS] Triggering queue processing with batch size: ${batchSize}`);

    // Get user session for edge function auth
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    // Call the edge function
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-ecommerce-hero-queue`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batchSize }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ECOMMERCE-HERO PROCESS] Edge function error:`, errorText);
      return NextResponse.json(
        { error: 'Processing failed', details: errorText },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`[ECOMMERCE-HERO PROCESS] Result:`, result);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[ECOMMERCE-HERO PROCESS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trigger processing' },
      { status: 500 }
    );
  }
}

/**
 * GET - Check processing status / pending count
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Get counts
    const [pendingResult, processingResult, completedResult, failedResult] = await Promise.all([
      supabase.from('ecommerce_hero_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('ecommerce_hero_queue').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('ecommerce_hero_queue').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('ecommerce_hero_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        pending: pendingResult.count || 0,
        processing: processingResult.count || 0,
        completed: completedResult.count || 0,
        failed: failedResult.count || 0,
      },
      canProcess: (pendingResult.count || 0) > 0,
    });
  } catch (error) {
    console.error('[ECOMMERCE-HERO PROCESS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    );
  }
}


