// ============================================================
// Report Issue API
// ============================================================
// POST: Buyer reports an issue with their purchase

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const body = await request.json();
    const { reason, description } = body;

    if (!reason) {
      return NextResponse.json(
        { error: 'Reason is required' },
        { status: 400 }
      );
    }

    // Fetch purchase and verify ownership
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id, buyer_id, funds_status, seller_id')
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
        { error: 'Not authorised to report issue for this purchase' },
        { status: 403 }
      );
    }

    // Check funds status - can only dispute if held
    if (purchase.funds_status !== 'held') {
      return NextResponse.json(
        { error: `Cannot report issue - funds have already been ${purchase.funds_status}` },
        { status: 400 }
      );
    }

    // Update purchase to disputed status
    const { error: updateError } = await supabase
      .from('purchases')
      .update({
        funds_status: 'disputed',
        buyer_notes: `DISPUTE: ${reason}${description ? ` - ${description}` : ''}`,
      })
      .eq('id', purchaseId);

    if (updateError) {
      console.error('[Report Issue] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update purchase' },
        { status: 500 }
      );
    }

    // TODO: Send notification to admin for review
    // TODO: Send notification to seller about the dispute

    console.log('[Report Issue] Dispute created:', purchaseId, reason);

    return NextResponse.json({
      success: true,
      message: 'Issue reported. Our team will review and contact you within 24-48 hours.',
    });

  } catch (error) {
    console.error('[Report Issue] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
