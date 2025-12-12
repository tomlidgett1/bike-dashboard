// ============================================================
// Payout Status Diagnostic
// ============================================================
// GET: Check payout status for recent purchases

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get recent purchases
    const { data: purchases, error: purchasesError } = await supabase
      .from('purchases')
      .select('id, order_number, seller_id, buyer_id, total_amount, funds_status, buyer_confirmed_at, payout_triggered_at, stripe_transfer_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (purchasesError) {
      return NextResponse.json({ 
        error: 'Failed to fetch purchases',
        details: purchasesError.message 
      }, { status: 500 });
    }

    // Get seller Stripe status for each purchase
    const purchasesWithSellerInfo = await Promise.all(
      (purchases || []).map(async (purchase) => {
        const { data: seller } = await supabase
          .from('users')
          .select('user_id, name, stripe_account_id, stripe_payouts_enabled, stripe_account_status')
          .eq('user_id', purchase.seller_id)
          .single();

        return {
          ...purchase,
          seller: seller ? {
            name: seller.name,
            has_stripe_account: !!seller.stripe_account_id,
            stripe_account_id: seller.stripe_account_id ? `${seller.stripe_account_id.substring(0, 15)}...` : null,
            payouts_enabled: seller.stripe_payouts_enabled,
            account_status: seller.stripe_account_status,
          } : null,
        };
      })
    );

    // Get recent payout attempts
    const { data: payouts, error: payoutsError } = await supabase
      .from('seller_payouts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      recent_purchases: purchasesWithSellerInfo,
      recent_payouts: payouts || [],
      payout_fetch_error: payoutsError?.message || null,
      summary: {
        total_purchases: purchases?.length || 0,
        confirmed_purchases: purchases?.filter(p => p.buyer_confirmed_at).length || 0,
        payouts_triggered: purchases?.filter(p => p.payout_triggered_at).length || 0,
        with_transfer_id: purchases?.filter(p => p.stripe_transfer_id).length || 0,
      }
    });

  } catch (error) {
    console.error('[Payout Status] Error:', error);
    return NextResponse.json({ 
      error: 'Internal error',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
