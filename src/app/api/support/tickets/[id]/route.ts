// ============================================================
// Support Ticket Detail API Routes
// ============================================================
// GET: Get ticket details
// PATCH: Update ticket

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// GET: Get ticket details
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Fetch ticket with related data
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select(`
        *,
        purchases (
          id,
          order_number,
          buyer_id,
          seller_id,
          total_amount,
          item_price,
          shipping_cost,
          status,
          funds_status,
          purchase_date,
          shipped_at,
          delivered_at,
          tracking_number,
          product:products (
            id,
            description,
            display_name,
            primary_image_url,
            cached_image_url,
            price
          ),
          seller:users!purchases_seller_id_users_fkey (
            user_id,
            name,
            business_name,
            logo_url
          ),
          buyer:users!purchases_buyer_id_users_fkey (
            user_id,
            name,
            business_name,
            logo_url
          )
        ),
        creator:users!support_tickets_created_by_users_fkey (
          user_id,
          name,
          business_name,
          logo_url
        )
      `)
      .eq('id', id)
      .single();

    if (ticketError) {
      if (ticketError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      console.error('[Support Ticket] Error fetching ticket:', ticketError);
      return NextResponse.json(
        { error: 'Failed to fetch ticket' },
        { status: 500 }
      );
    }

    // Check user has access
    const purchase = ticket.purchases;
    if (
      ticket.created_by !== user.id &&
      purchase?.seller_id !== user.id
    ) {
      return NextResponse.json(
        { error: 'Not authorised to view this ticket' },
        { status: 403 }
      );
    }

    // Fetch messages
    const { data: messages } = await supabase
      .from('ticket_messages')
      .select(`
        *,
        sender:users!ticket_messages_sender_id_users_fkey (
          user_id,
          name,
          business_name,
          logo_url
        )
      `)
      .eq('ticket_id', id)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });

    // Fetch attachments
    const { data: attachments } = await supabase
      .from('ticket_attachments')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    // Fetch history
    const { data: history } = await supabase
      .from('ticket_history')
      .select(`
        *,
        performer:users!ticket_history_performed_by_users_fkey (
          user_id,
          name,
          business_name
        )
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: false });

    // Determine user's role
    const userRole = ticket.created_by === user.id ? 'buyer' : 'seller';

    return NextResponse.json({
      ticket: {
        ...ticket,
        purchase,
        product: purchase?.product,
        seller: purchase?.seller,
        buyer: purchase?.buyer,
      },
      messages: messages || [],
      attachments: attachments || [],
      history: history || [],
      userRole,
    });
  } catch (error) {
    console.error('[Support Ticket] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH: Update ticket
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const { status, resolution, resolutionType } = body;

    // Fetch existing ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select(`
        *,
        purchases (seller_id)
      `)
      .eq('id', id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Check user has access
    if (
      ticket.created_by !== user.id &&
      ticket.purchases?.seller_id !== user.id
    ) {
      return NextResponse.json(
        { error: 'Not authorised to update this ticket' },
        { status: 403 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    // Users can only close/reopen their own tickets
    if (status) {
      if (ticket.created_by === user.id) {
        // Buyer can only set status to 'closed' (accepting resolution)
        if (status === 'closed' && ticket.status === 'resolved') {
          updates.status = 'closed';
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from('support_tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Support Ticket] Error updating ticket:', updateError);
      return NextResponse.json(
        { error: 'Failed to update ticket' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ticket: updatedTicket,
      message: 'Ticket updated successfully',
    });
  } catch (error) {
    console.error('[Support Ticket] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

