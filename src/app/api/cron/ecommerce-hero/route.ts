/**
 * E-Commerce Hero Queue Cron Job
 * GET /api/cron/ecommerce-hero
 * 
 * This endpoint is called by Vercel Cron (or any external cron service)
 * to process the e-commerce hero queue in the background.
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/ecommerce-hero",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for processing

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional but recommended for security)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // If CRON_SECRET is set, verify it
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Also allow Vercel's built-in cron verification
      const isVercelCron = request.headers.get('x-vercel-cron') === '1';
      if (!isVercelCron) {
        console.log('[CRON] Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('[CRON ECOMMERCE-HERO] Starting cron job...');

    // Create Supabase client with service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[CRON] Missing Supabase configuration');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for pending items
    const { count: pendingCount, error: countError } = await supabase
      .from('ecommerce_hero_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (countError) {
      console.error('[CRON] Error checking queue:', countError);
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if (!pendingCount || pendingCount === 0) {
      console.log('[CRON ECOMMERCE-HERO] No pending items, skipping');
      return NextResponse.json({
        success: true,
        message: 'No pending items',
        processed: 0,
      });
    }

    console.log(`[CRON ECOMMERCE-HERO] Found ${pendingCount} pending items, triggering processing...`);

    // Call the edge function
    const functionUrl = `${supabaseUrl}/functions/v1/process-ecommerce-hero-queue`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batchSize: 5 }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[CRON] Edge function error:', errorText);
      return NextResponse.json(
        { error: 'Edge function failed', details: errorText },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log('[CRON ECOMMERCE-HERO] Processing complete:', result);

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error('[CRON ECOMMERCE-HERO] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron job failed' },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}


