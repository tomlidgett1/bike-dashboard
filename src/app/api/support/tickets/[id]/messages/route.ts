// ============================================================
// Ticket Messages API Routes
// ============================================================
// GET: Get messages for a ticket
// POST: Add message to ticket

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// GET: Get messages for a ticket
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: ticketId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Verify user has access to this ticket
    const { data: ticket } = await supabase
      .from('support_tickets')
      .select(`
        id,
        created_by,
        purchases (seller_id)
      `)
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const purchaseData = ticket.purchases as unknown as { seller_id: string } | null;
    if (
      ticket.created_by !== user.id &&
      purchaseData?.seller_id !== user.id
    ) {
      return NextResponse.json(
        { error: 'Not authorised to view messages for this ticket' },
        { status: 403 }
      );
    }

    // Fetch messages
    const { data: messages, error: messagesError } = await supabase
      .from('ticket_messages')
      .select(`
        *,
        sender:users!ticket_messages_sender_id_fkey (
          user_id,
          name,
          business_name,
          logo_url
        )
      `)
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('[Ticket Messages] Error fetching messages:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      messages: messages || [],
    });
  } catch (error) {
    console.error('[Ticket Messages] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST: Add message to ticket
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: ticketId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const { message, attachments } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this ticket
    const { data: ticket } = await supabase
      .from('support_tickets')
      .select(`
        id,
        created_by,
        status,
        purchases (buyer_id, seller_id)
      `)
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const purchaseDataPost = ticket.purchases as unknown as { buyer_id: string; seller_id: string } | null;
    const isBuyer = purchaseDataPost?.buyer_id === user.id;
    const isSeller = purchaseDataPost?.seller_id === user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: 'Not authorised to add messages to this ticket' },
        { status: 403 }
      );
    }

    // Check if ticket is still open
    if (ticket.status === 'closed' || ticket.status === 'resolved') {
      return NextResponse.json(
        { error: 'Cannot add messages to a closed or resolved ticket' },
        { status: 400 }
      );
    }

    // Determine sender type
    const senderType = isBuyer ? 'buyer' : 'seller';

    // Create message
    const { data: newMessage, error: messageError } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        sender_type: senderType,
        message: message.trim(),
        attachments: attachments ? JSON.stringify(attachments) : '[]',
        is_internal: false,
      })
      .select(`
        *,
        sender:users!ticket_messages_sender_id_users_fkey (
          user_id,
          name,
          business_name,
          logo_url
        )
      `)
      .single();

    if (messageError) {
      console.error('[Ticket Messages] Error creating message:', messageError);
      return NextResponse.json(
        { error: 'Failed to add message' },
        { status: 500 }
      );
    }

    // Update ticket status to awaiting_response if needed
    if (ticket.status === 'open' && senderType === 'buyer') {
      await supabase
        .from('support_tickets')
        .update({ status: 'awaiting_response' })
        .eq('id', ticketId);
    } else if (ticket.status === 'awaiting_response' && senderType === 'seller') {
      // Seller responded, back to in_review
      await supabase
        .from('support_tickets')
        .update({ status: 'in_review' })
        .eq('id', ticketId);
    }

    // Upload attachments if provided
    if (attachments && attachments.length > 0) {
      const attachmentRecords = attachments.map((att: { url: string; fileName: string; fileType: string }) => ({
        ticket_id: ticketId,
        uploaded_by: user.id,
        file_url: att.url,
        file_name: att.fileName,
        file_type: att.fileType,
      }));

      await supabase.from('ticket_attachments').insert(attachmentRecords);
    }

    return NextResponse.json(
      {
        message: newMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Ticket Messages] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

