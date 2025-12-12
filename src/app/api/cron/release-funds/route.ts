// ============================================================
// Release Funds Cron Job
// ============================================================
// GET/POST: Auto-releases funds for purchases past 7 days
// Should be called by Vercel Cron or similar scheduler

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerSellerPayout } from '@/lib/stripe/payouts';

// Use service role for cron job
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
  return handleReleaseFunds(request);
}

export async function POST(request: NextRequest) {
  return handleReleaseFunds(request);
}

async function handleReleaseFunds(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;
    
    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    const supabase = getServiceClient();

    // Find all purchases ready for auto-release
    // funds_status = 'held' AND funds_release_at <= NOW()
    const { data: purchases, error: fetchError } = await supabase
      .from('purchases')
      .select(`
        id,
        order_number,
        seller_id,
        total_amount,
        platform_fee,
        seller_payout_amount,
        funds_release_at
      `)
      .eq('funds_status', 'held')
      .lte('funds_release_at', new Date().toISOString());

    if (fetchError) {
      console.error('[Release Funds Cron] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch purchases' },
        { status: 500 }
      );
    }

    if (!purchases || purchases.length === 0) {
      console.log('[Release Funds Cron] No purchases ready for release');
      return NextResponse.json({
        success: true,
        released: 0,
        message: 'No purchases ready for auto-release',
      });
    }

    console.log(`[Release Funds Cron] Found ${purchases.length} purchases to release`);

    const results = {
      released: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each purchase
    for (const purchase of purchases) {
      try {
        // Update funds status to auto_released
        const { error: updateError } = await supabase
          .from('purchases')
          .update({
            funds_status: 'auto_released',
          })
          .eq('id', purchase.id)
          .eq('funds_status', 'held'); // Atomic check

        if (updateError) {
          throw new Error(`Update failed: ${updateError.message}`);
        }

        // Trigger payout
        await triggerSellerPayout(purchase.id);

        results.released++;
        console.log(`[Release Funds Cron] Released: ${purchase.order_number}`);

      } catch (err) {
        results.failed++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${purchase.order_number}: ${message}`);
        console.error(`[Release Funds Cron] Failed: ${purchase.order_number}`, err);
      }
    }

    console.log(`[Release Funds Cron] Complete: ${results.released} released, ${results.failed} failed`);

    return NextResponse.json({
      success: true,
      ...results,
    });

  } catch (error) {
    console.error('[Release Funds Cron] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

