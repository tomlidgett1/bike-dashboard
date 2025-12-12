// ============================================================
// Confirm Receipt API
// ============================================================
// POST: Buyer confirms they received the item, triggering payout

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { triggerSellerPayout } from '@/lib/stripe/payouts';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: purchaseId } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    // Fetch purchase and verify ownership
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select(`
        id,
        buyer_id,
        seller_id,
        funds_status,
        total_amount,
        platform_fee,
        seller_payout_amount,
        order_number
      `)
      .eq('id', purchaseId)
      .single();

    if (purchaseError || !purchase) {
      return NextResponse.json(
        { error: 'Purchase not found' },
        { status: 404 }
      );
    }

    // Verify buyer owns this purchase
    if (purchase.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorised to confirm this purchase' },
        { status: 403 }
      );
    }

    // Check funds status
    if (purchase.funds_status !== 'held') {
      return NextResponse.json(
        { error: `Cannot confirm - funds are ${purchase.funds_status}` },
        { status: 400 }
      );
    }

    // Update purchase with confirmation
    const { error: updateError } = await supabase
      .from('purchases')
      .update({
        buyer_confirmed_at: new Date().toISOString(),
        funds_status: 'released',
      })
      .eq('id', purchaseId);

    if (updateError) {
      console.error('[Confirm Receipt] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update purchase' },
        { status: 500 }
      );
    }

    // Trigger payout to seller
    try {
      await triggerSellerPayout(purchaseId);
    } catch (payoutError) {
      console.error('[Confirm Receipt] Payout error:', payoutError);
      // Don't fail the request - payout can be retried
    }

    console.log('[Confirm Receipt] Purchase confirmed:', purchaseId);

    return NextResponse.json({
      success: true,
      message: 'Receipt confirmed. Seller payout initiated.',
    });

  } catch (error) {
    console.error('[Confirm Receipt] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
