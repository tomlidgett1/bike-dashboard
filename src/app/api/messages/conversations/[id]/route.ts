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

    // OPTIMIZATION: Execute all initial queries in parallel
    const startIndex = (page - 1) * limit;
    const batch1Start = Date.now();
    
    const [
      { data: participant, error: participantError },
      { data: conversation, error: conversationError },
      { data: participants },
      { data: messages, error: messagesError }
    ] = await Promise.all([
      // Verify user is a participant
      supabase
        .from('conversation_participants')
        .select('*')
        .eq('conversation_id', id)
        .eq('user_id', user.id)
        .single(),
      
      // Fetch conversation details
      supabase
        .from('conversations')
        .select('*, products(id, description, display_name, price, primary_image_url)')
        .eq('id', id)
        .single(),
      
      // Fetch all participants (just IDs for now)
      supabase
        .from('conversation_participants')
        .select('*')
        .eq('conversation_id', id),
      
      // Fetch messages with pagination
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .range(startIndex, startIndex + limit - 1)
    ]);
    console.log(`[Conversation API] Batch 1 took: ${Date.now() - batch1Start}ms`);

    // Check for errors
    if (participantError || !participant) {
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 404 }
      );
    }

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    // OPTIMIZATION: Fetch attachments, senders, and participant user details in parallel
    const messageIds = messages?.map((m) => m.id) || [];
    const senderIds = [...new Set(messages?.map((m) => m.sender_id).filter(Boolean) as string[])];
    const participantUserIds = [...new Set(participants?.map((p: any) => p.user_id) || [])];

    const batch2Start = Date.now();
    const [
      { data: attachments },
      { data: senders },
      { data: participantUsers }
    ] = await Promise.all([
      // Fetch attachments
      messageIds.length > 0
        ? supabase.from('message_attachments').select('*').in('message_id', messageIds)
        : Promise.resolve({ data: null }),
      
      // Fetch sender details
      senderIds.length > 0
        ? supabase.from('users').select('user_id, name, business_name, logo_url').in('user_id', senderIds)
        : Promise.resolve({ data: null }),
      
      // Fetch participant user details
      participantUserIds.length > 0
        ? supabase.from('users').select('user_id, name, business_name, logo_url').in('user_id', participantUserIds)
        : Promise.resolve({ data: null })
    ]);
    
    console.log(`[Conversation API] Batch 2 took: ${Date.now() - batch2Start}ms`);
    console.log(`[Conversation API] Total time: ${Date.now() - batch1Start}ms`);
    
    // Mark conversation as read - fire and forget (don't await, don't block response)
    supabase
      .from('conversation_participants')
      .update({
        last_read_at: new Date().toISOString(),
        unread_count: 0
      })
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .then(({ error: updateError }) => {
        if (updateError) {
          console.error('Error marking conversation as read:', updateError);
        }
      });

    // Build maps for efficient lookup
    const attachmentsMap = new Map();
    attachments?.forEach((attachment) => {
      if (!attachmentsMap.has(attachment.message_id)) {
        attachmentsMap.set(attachment.message_id, []);
      }
      attachmentsMap.get(attachment.message_id).push(attachment);
    });

    const sendersMap = new Map();
    senders?.forEach((sender) => {
      sendersMap.set(sender.user_id, sender);
    });

    const participantUsersMap = new Map();
    participantUsers?.forEach((user) => {
      participantUsersMap.set(user.user_id, user);
    });

    // Enrich messages with attachments and sender info
    const messagesWithAttachments = messages?.map((message) => ({
      ...message,
      attachments: attachmentsMap.get(message.id) || [],
      sender: message.sender_id
        ? sendersMap.get(message.sender_id)
        : undefined,
    }));

    // Build response
    const response: GetConversationResponse = {
      conversation: {
        ...conversation,
        participants: participants?.map((p: any) => {
          const userDetails = participantUsersMap.get(p.user_id);
          return {
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
            // Include user details if needed
            user: userDetails || undefined,
          };
        }),
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





