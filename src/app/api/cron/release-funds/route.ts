// ============================================================
// Release Funds Cron Job
// ============================================================
// GET/POST: Auto-releases funds for purchases past 7 days
// Should be called by Vercel Cron or similar scheduler

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerSellerPayout } from '@/lib/stripe/payouts';

type ReleaseCandidate = {
  id: string;
  order_number: string;
  seller_id: string;
  total_amount: number;
  platform_fee: number | null;
  seller_payout_amount: number | null;
  funds_status: 'held' | 'released' | 'auto_released';
  funds_release_at: string | null;
  payout_status: string | null;
  stripe_transfer_id: string | null;
};

const RELEASE_CANDIDATE_SELECT = `
  id,
  order_number,
  seller_id,
  total_amount,
  platform_fee,
  seller_payout_amount,
  funds_status,
  funds_release_at,
  payout_status,
  stripe_transfer_id
`;

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
    // Allow Vercel Cron, or manual calls with either supported secret header.
    const expectedSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.headers.get('x-cron-secret');
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    
    if (
      expectedSecret &&
      !isVercelCron &&
      authHeader !== `Bearer ${expectedSecret}` &&
      cronSecret !== expectedSecret
    ) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    const supabase = getServiceClient();
    const now = new Date().toISOString();

    // Held purchases become auto-released after the 7-day hold.
    const { data: duePurchases, error: dueFetchError } = await supabase
      .from('purchases')
      .select(RELEASE_CANDIDATE_SELECT)
      .eq('funds_status', 'held')
      .lte('funds_release_at', now)
      .returns<ReleaseCandidate[]>();

    if (dueFetchError) {
      console.error('[Release Funds Cron] Due purchase fetch error:', dueFetchError);
      return NextResponse.json(
        { error: 'Failed to fetch due purchases' },
        { status: 500 }
      );
    }

    // If a previous release marked funds released but the Stripe transfer failed,
    // keep retrying until the purchase has a transfer id.
    const { data: retryPurchases, error: retryFetchError } = await supabase
      .from('purchases')
      .select(RELEASE_CANDIDATE_SELECT)
      .in('funds_status', ['released', 'auto_released'])
      .is('stripe_transfer_id', null)
      .or('payout_status.is.null,payout_status.in.(pending,processing,failed)')
      .returns<ReleaseCandidate[]>();

    if (retryFetchError) {
      console.error('[Release Funds Cron] Retry purchase fetch error:', retryFetchError);
      return NextResponse.json(
        { error: 'Failed to fetch retryable purchases' },
        { status: 500 }
      );
    }

    const purchasesById = new Map<string, ReleaseCandidate>();
    for (const purchase of duePurchases || []) {
      purchasesById.set(purchase.id, purchase);
    }
    for (const purchase of retryPurchases || []) {
      purchasesById.set(purchase.id, purchase);
    }

    const purchases = Array.from(purchasesById.values());

    if (purchases.length === 0) {
      console.log('[Release Funds Cron] No purchases ready for release or payout retry');
      return NextResponse.json({
        success: true,
        released: 0,
        retried: 0,
        failed: 0,
        message: 'No purchases ready for auto-release or payout retry',
      });
    }

    console.log(`[Release Funds Cron] Found ${purchases.length} purchases to release or retry`);

    const results = {
      released: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Process each purchase
    for (const purchase of purchases) {
      try {
        const autoReleaseNow = purchase.funds_status === 'held';

        if (autoReleaseNow) {
          const { data: updatedPurchase, error: updateError } = await supabase
            .from('purchases')
            .update({
              funds_status: 'auto_released',
              payout_status: 'processing',
            })
            .eq('id', purchase.id)
            .eq('funds_status', 'held')
            .select('id')
            .maybeSingle();

          if (updateError) {
            throw new Error(`Update failed: ${updateError.message}`);
          }

          if (!updatedPurchase) {
            results.skipped++;
            console.log(`[Release Funds Cron] Skipped already-updated purchase: ${purchase.order_number}`);
            continue;
          }
        } else {
          await supabase
            .from('purchases')
            .update({ payout_status: 'processing' })
            .eq('id', purchase.id)
            .is('stripe_transfer_id', null);
        }

        // Trigger payout
        await triggerSellerPayout(purchase.id);

        if (autoReleaseNow) {
          results.released++;
          console.log(`[Release Funds Cron] Auto-released: ${purchase.order_number}`);
        } else {
          results.retried++;
          console.log(`[Release Funds Cron] Retried payout: ${purchase.order_number}`);
        }

      } catch (err) {
        results.failed++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${purchase.order_number}: ${message}`);
        console.error(`[Release Funds Cron] Failed: ${purchase.order_number}`, err);
      }
    }

    console.log(
      `[Release Funds Cron] Complete: ${results.released} released, ` +
      `${results.retried} retried, ${results.failed} failed, ${results.skipped} skipped`
    );

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
