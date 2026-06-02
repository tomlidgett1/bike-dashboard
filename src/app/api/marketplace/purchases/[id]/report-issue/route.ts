// ============================================================
// Report Issue API
// ============================================================
// POST: Buyer reports an issue with their purchase

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CATEGORY_MAP: Record<string, string> = {
  not_received: 'item_not_received',
  item_not_received: 'item_not_received',
  not_as_described: 'item_not_as_described',
  item_not_as_described: 'item_not_as_described',
  damaged: 'damaged',
  wrong_item: 'wrong_item',
  refund: 'refund_request',
  refund_request: 'refund_request',
  shipping: 'shipping_issue',
  shipping_issue: 'shipping_issue',
};

const DISPUTE_POLICY_SNAPSHOT = {
  version: '2026-06-02',
  sellerResponseHours: 48,
  buyerResponseHours: 72,
  fundsHeldWhileDisputed: true,
  autoReleaseDaysWithoutReceipt: 7,
};

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
      .select('id, order_number, buyer_id, funds_status, seller_id')
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

    const { data: existingTicket } = await supabase
      .from('support_tickets')
      .select('id, ticket_number')
      .eq('purchase_id', purchaseId)
      .in('status', ['open', 'awaiting_response', 'in_review', 'escalated'])
      .maybeSingle();

    if (existingTicket) {
      return NextResponse.json({
        success: true,
        ticketId: existingTicket.id,
        ticketNumber: existingTicket.ticket_number,
        message: 'Issue already reported. Your active claim is open in support.',
      });
    }

    const now = new Date().toISOString();
    const category = CATEGORY_MAP[String(reason).toLowerCase()] || 'general_question';
    const subject = `Issue with order ${purchase.order_number || purchase.id}`;
    const message = `${reason}${description ? `\n\n${description}` : ''}`;

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        ticket_number: `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        purchase_id: purchaseId,
        created_by: user.id,
        category,
        status: 'open',
        priority: 'high',
        subject,
        description: message,
        requested_resolution: category === 'refund_request' ? 'refund' : null,
        seller_response_due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        policy_snapshot: DISPUTE_POLICY_SNAPSHOT,
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      console.error('[Report Issue] Ticket error:', ticketError);
      return NextResponse.json(
        { error: 'Failed to create support ticket' },
        { status: 500 }
      );
    }

    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_type: 'buyer',
      message,
      attachments: '[]',
    });

    // Update purchase to disputed status
    const { error: updateError } = await supabase
      .from('purchases')
      .update({
        funds_status: 'disputed',
        dispute_opened_at: now,
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

    console.log('[Report Issue] Dispute created:', purchaseId, reason);

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      message: 'Issue reported. The seller has been notified and funds are held while it is reviewed.',
    });

  } catch (error) {
    console.error('[Report Issue] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
