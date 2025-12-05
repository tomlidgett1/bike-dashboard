// ============================================================
// CONVERSATION DETAIL API ROUTE
// ============================================================
// GET: Fetch conversation with messages and mark as read

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { GetConversationResponse } from '@/lib/types/message';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Parse query params for pagination
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 404 }
      );
    }

    // Fetch conversation details
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select(
        `
        *,
        products(id, description, display_name, price, primary_image_url)
      `
      )
      .eq('id', id)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Fetch all participants
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select(
        `
        *,
        users!user_id(user_id, name, business_name, logo_url)
      `
      )
      .eq('conversation_id', id);

    // Fetch messages with pagination
    const startIndex = (page - 1) * limit;
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .range(startIndex, startIndex + limit - 1);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    // Fetch attachments for all messages
    const messageIds = messages?.map((m) => m.id) || [];
    let attachmentsMap = new Map();

    if (messageIds.length > 0) {
      const { data: attachments } = await supabase
        .from('message_attachments')
        .select('*')
        .in('message_id', messageIds);

      attachments?.forEach((attachment) => {
        if (!attachmentsMap.has(attachment.message_id)) {
          attachmentsMap.set(attachment.message_id, []);
        }
        attachmentsMap.get(attachment.message_id).push(attachment);
      });
    }

    // Fetch sender details for messages
    const senderIds = [
      ...new Set(
        messages?.map((m) => m.sender_id).filter(Boolean) as string[]
      ),
    ];
    let sendersMap = new Map();

    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('users')
        .select('user_id, name, business_name, logo_url')
        .in('user_id', senderIds);

      senders?.forEach((sender) => {
        sendersMap.set(sender.user_id, sender);
      });
    }

    // Enrich messages with attachments and sender info
    const messagesWithAttachments = messages?.map((message) => ({
      ...message,
      attachments: attachmentsMap.get(message.id) || [],
      sender: message.sender_id
        ? sendersMap.get(message.sender_id)
        : undefined,
    }));

    // Mark conversation as read
    await supabase.rpc('mark_conversation_read', {
      p_conversation_id: id,
      p_user_id: user.id,
    });

    // Build response
    const response: GetConversationResponse = {
      conversation: {
        ...conversation,
        participants: participants?.map((p: any) => ({
          id: p.id,
          conversation_id: p.conversation_id,
          user_id: p.user_id,
          role: p.role,
          last_read_at: p.last_read_at,
          unread_count: p.unread_count,
          is_archived: p.is_archived,
          notification_preference: p.notification_preference,
          joined_at: p.joined_at,
          updated_at: p.updated_at,
        })),
        product: conversation.products
          ? {
              id: conversation.products.id,
              description: conversation.products.description,
              display_name: conversation.products.display_name,
              price: conversation.products.price,
              primary_image_url: conversation.products.primary_image_url,
            }
          : undefined,
        messages: messagesWithAttachments || [],
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Unexpected error fetching conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}



