// ============================================================
// Support Tickets API Routes
// ============================================================
// GET: List user's tickets
// POST: Create new ticket

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// Types
// ============================================================

interface CreateTicketRequest {
  purchaseId: string;
  category: string;
  subcategory?: string;
  subject: string;
  description: string;
  requestedResolution?: string;
  attachments?: { url: string; fileName: string; fileType: string }[];
}

// ============================================================
// GET: List user's tickets
// ============================================================

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

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Build query - get tickets user created OR tickets on their sales
    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        purchases!inner (
          id,
          order_number,
          buyer_id,
          seller_id,
          total_amount,
          status,
          purchase_date,
          product:products (
            id,
            description,
            display_name,
            primary_image_url,
            cached_image_url
          )
        ),
        creator:users!support_tickets_created_by_users_fkey (
          user_id,
          name,
          business_name,
          logo_url
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filter by status if provided
    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['open', 'awaiting_response', 'in_review', 'escalated']);
      } else {
        query = query.eq('status', status);
      }
    }

    const { data: tickets, error: ticketsError } = await query;

    if (ticketsError) {
      console.error('[Support Tickets] Error fetching tickets:', ticketsError);
      return NextResponse.json(
        { error: 'Failed to fetch tickets' },
        { status: 500 }
      );
    }

    // Get message counts for each ticket
    const ticketIds = tickets?.map((t) => t.id) || [];
    let messageCounts: Record<string, number> = {};

    if (ticketIds.length > 0) {
      const { data: counts } = await supabase
        .from('ticket_messages')
        .select('ticket_id')
        .in('ticket_id', ticketIds)
        .eq('is_internal', false);

      counts?.forEach((msg) => {
        messageCounts[msg.ticket_id] = (messageCounts[msg.ticket_id] || 0) + 1;
      });
    }

    // Enrich tickets
    const enrichedTickets = tickets?.map((ticket) => ({
      ...ticket,
      messageCount: messageCounts[ticket.id] || 0,
      purchase: ticket.purchases,
      product: ticket.purchases?.product,
    }));

    return NextResponse.json({
      tickets: enrichedTickets || [],
      total: enrichedTickets?.length || 0,
    });
  } catch (error) {
    console.error('[Support Tickets] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST: Create new ticket
// ============================================================

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

    const body: CreateTicketRequest = await request.json();
    const {
      purchaseId,
      category,
      subcategory,
      subject,
      description,
      requestedResolution,
      attachments,
    } = body;

    // Validate required fields
    if (!purchaseId || !category || !subject || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: purchaseId, category, subject, description' },
        { status: 400 }
      );
    }

    // Validate category
    const validCategories = [
      'item_not_received',
      'item_not_as_described',
      'damaged',
      'wrong_item',
      'refund_request',
      'shipping_issue',
      'general_question',
    ];

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Verify purchase exists and user is the buyer
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id, buyer_id, seller_id, funds_status')
      .eq('id', purchaseId)
      .single();

    if (purchaseError || !purchase) {
      return NextResponse.json(
        { error: 'Purchase not found' },
        { status: 404 }
      );
    }

    if (purchase.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorised to create ticket for this purchase' },
        { status: 403 }
      );
    }

    // Check if there's already an open ticket for this purchase
    const { data: existingTicket } = await supabase
      .from('support_tickets')
      .select('id, ticket_number')
      .eq('purchase_id', purchaseId)
      .in('status', ['open', 'awaiting_response', 'in_review', 'escalated'])
      .single();

    if (existingTicket) {
      return NextResponse.json(
        { 
          error: 'An active ticket already exists for this purchase',
          existingTicket: existingTicket.ticket_number,
        },
        { status: 409 }
      );
    }

    // Generate ticket number
    const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Determine priority based on category and funds status
    let priority = 'medium';
    if (category === 'damaged' || category === 'wrong_item') {
      priority = 'high';
    }
    if (purchase.funds_status === 'held' && category !== 'general_question') {
      priority = 'high'; // Escalate if funds are still held
    }

    // Create the ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        ticket_number: ticketNumber,
        purchase_id: purchaseId,
        created_by: user.id,
        category,
        subcategory: subcategory || null,
        status: 'open',
        priority,
        subject,
        description,
        requested_resolution: requestedResolution || null,
      })
      .select()
      .single();

    if (ticketError) {
      console.error('[Support Tickets] Error creating ticket:', ticketError);
      return NextResponse.json(
        { error: 'Failed to create ticket' },
        { status: 500 }
      );
    }

    // Add initial message
    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_type: 'buyer',
      message: description,
      attachments: attachments ? JSON.stringify(attachments) : '[]',
    });

    // Upload attachments if provided
    if (attachments && attachments.length > 0) {
      const attachmentRecords = attachments.map((att) => ({
        ticket_id: ticket.id,
        uploaded_by: user.id,
        file_url: att.url,
        file_name: att.fileName,
        file_type: att.fileType,
      }));

      await supabase.from('ticket_attachments').insert(attachmentRecords);
    }

    // Update purchase funds_status to 'disputed' for certain categories
    if (['item_not_received', 'item_not_as_described', 'damaged', 'wrong_item', 'refund_request'].includes(category)) {
      if (purchase.funds_status === 'held') {
        await supabase
          .from('purchases')
          .update({ funds_status: 'disputed' })
          .eq('id', purchaseId);
      }
    }

    // Fetch enriched ticket data
    const { data: enrichedTicket } = await supabase
      .from('support_tickets')
      .select(`
        *,
        purchases (
          id,
          order_number,
          buyer_id,
          seller_id,
          total_amount,
          status,
          purchase_date,
          product:products (
            id,
            description,
            display_name,
            primary_image_url,
            cached_image_url
          )
        )
      `)
      .eq('id', ticket.id)
      .single();

    console.log('[Support Tickets] Ticket created:', ticketNumber);

    return NextResponse.json(
      {
        ticket: enrichedTicket,
        message: 'Your support ticket has been created. We will respond within 24-48 hours.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Support Tickets] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

