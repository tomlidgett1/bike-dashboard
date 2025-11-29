// ============================================================
// CONVERSATIONS API ROUTES
// ============================================================
// POST: Create new conversation
// GET: List user's conversations

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  GetConversationsRequest,
  GetConversationsResponse,
  ConversationListItem,
} from '@/lib/types/message';

// ============================================================
// POST: Create new conversation
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body: CreateConversationRequest = await request.json();
    const { productId, recipientUserId, subject, initialMessage } = body;

    // Validate required fields
    if (!recipientUserId || !initialMessage) {
      return NextResponse.json(
        { error: 'Missing required fields: recipientUserId, initialMessage' },
        { status: 400 }
      );
    }

    // Check if conversation already exists for this product between these users
    if (productId) {
      const { data: existingConversations } = await supabase
        .from('conversations')
        .select(
          `
          id,
          conversation_participants!inner(user_id)
        `
        )
        .eq('product_id', productId)
        .eq('status', 'active');

      // Check if both users are participants in any of these conversations
      const existingConversation = existingConversations?.find((conv: any) => {
        const participantIds = conv.conversation_participants.map(
          (p: any) => p.user_id
        );
        return (
          participantIds.includes(user.id) &&
          participantIds.includes(recipientUserId)
        );
      });

      if (existingConversation) {
        return NextResponse.json(
          {
            error: 'Conversation already exists',
            conversationId: existingConversation.id,
          },
          { status: 409 }
        );
      }
    }

    // Get product details if productId is provided
    let productSubject = subject || 'General inquiry';
    if (productId) {
      const { data: product } = await supabase
        .from('products')
        .select('description, display_name')
        .eq('id', productId)
        .single();

      if (product) {
        productSubject =
          subject ||
          `Inquiry about ${product.display_name || product.description}`;
      }
    }

    // Create conversation
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        product_id: productId || null,
        subject: productSubject,
        status: 'active',
      })
      .select()
      .single();

    if (conversationError || !conversation) {
      console.error('Error creating conversation:', conversationError);
      console.error('Conversation data:', conversation);
      console.error('Insert payload:', {
        product_id: productId || null,
        subject: productSubject,
        status: 'active',
      });
      return NextResponse.json(
        { error: conversationError?.message || 'Failed to create conversation' },
        { status: 500 }
      );
    }

    // Determine participant roles
    const isProductOwner =
      productId &&
      (await supabase
        .from('products')
        .select('user_id')
        .eq('id', productId)
        .eq('user_id', user.id)
        .single()
        .then((res) => !!res.data));

    // Add participants
    const participants = [
      {
        conversation_id: conversation.id,
        user_id: user.id,
        role: isProductOwner ? 'seller' : 'buyer',
      },
      {
        conversation_id: conversation.id,
        user_id: recipientUserId,
        role: isProductOwner ? 'buyer' : 'seller',
      },
    ];

    const { error: participantsError } = await supabase
      .from('conversation_participants')
      .insert(participants);

    if (participantsError) {
      console.error('Error adding participants:', participantsError);
      // Rollback: delete conversation
      await supabase.from('conversations').delete().eq('id', conversation.id);
      return NextResponse.json(
        { error: 'Failed to add participants' },
        { status: 500 }
      );
    }

    // Send initial message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        content: initialMessage,
        message_type: 'user',
      })
      .select()
      .single();

    if (messageError || !message) {
      console.error('Error sending message:', messageError);
      return NextResponse.json(
        { error: 'Failed to send initial message' },
        { status: 500 }
      );
    }

    // Fetch complete conversation with participants
    const { data: completeConversation } = await supabase
      .from('conversations')
      .select(
        `
        *,
        conversation_participants(*),
        products(id, description, display_name, price, primary_image_url)
      `
      )
      .eq('id', conversation.id)
      .single();

    const response: CreateConversationResponse = {
      conversation: completeConversation,
      message,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Unexpected error creating conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// GET: List user's conversations
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status') as
      | 'active'
      | 'archived'
      | 'closed'
      | null;
    const archived = searchParams.get('archived') === 'true';

    // Get user's participant records to find conversations
    let participantQuery = supabase
      .from('conversation_participants')
      .select(
        `
        conversation_id,
        unread_count,
        is_archived,
        last_read_at,
        conversations(
          id,
          subject,
          status,
          last_message_at,
          message_count,
          product_id,
          products(id, description, display_name, primary_image_url)
        )
      `
      )
      .eq('user_id', user.id)
      .order('last_read_at', { ascending: false });

    if (archived !== null) {
      participantQuery = participantQuery.eq('is_archived', archived);
    }

    const { data: participantRecords, error: participantError } =
      await participantQuery;

    if (participantError) {
      console.error('Error fetching conversations:', participantError);
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      );
    }

    // Extract conversations and enrich with data
    const conversationIds =
      participantRecords
        ?.map((p: any) => p.conversations?.id)
        .filter(Boolean) || [];

    if (conversationIds.length === 0) {
      const response: GetConversationsResponse = {
        conversations: [],
        total: 0,
        page,
        limit,
      };
      return NextResponse.json(response);
    }

    // Get other participants for each conversation
    const { data: allParticipants } = await supabase
      .from('conversation_participants')
      .select(
        `
        conversation_id,
        user_id,
        users!user_id(user_id, name, business_name, logo_url)
      `
      )
      .in('conversation_id', conversationIds)
      .neq('user_id', user.id);

    // Get last message for each conversation
    const { data: lastMessages } = await supabase
      .from('messages')
      .select('conversation_id, content, sender_id, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false });

    // Build conversation list items
    const conversationMap = new Map<string, any>();
    participantRecords?.forEach((pr: any) => {
      if (pr.conversations) {
        conversationMap.set(pr.conversations.id, {
          ...pr.conversations,
          unread_count: pr.unread_count,
          is_archived: pr.is_archived,
        });
      }
    });

    const conversations: ConversationListItem[] = Array.from(
      conversationMap.values()
    ).map((conv) => {
      // Get other participants
      const otherParticipants =
        allParticipants
          ?.filter((p: any) => p.conversation_id === conv.id)
          .map((p: any) => ({
            user_id: p.users.user_id,
            name: p.users.name || '',
            business_name: p.users.business_name || '',
            logo_url: p.users.logo_url || null,
          })) || [];

      // Get last message
      const lastMessage = lastMessages?.find(
        (m: any) => m.conversation_id === conv.id
      );

      return {
        id: conv.id,
        subject: conv.subject,
        status: conv.status,
        last_message_at: conv.last_message_at,
        message_count: conv.message_count,
        unread_count: conv.unread_count,
        is_archived: conv.is_archived,
        other_participants: otherParticipants,
        product: conv.products
          ? {
              id: conv.products.id,
              description: conv.products.description,
              display_name: conv.products.display_name,
              primary_image_url: conv.products.primary_image_url,
            }
          : undefined,
        last_message: lastMessage
          ? {
              content: lastMessage.content,
              sender_id: lastMessage.sender_id,
              created_at: lastMessage.created_at,
            }
          : undefined,
      };
    });

    // Sort by last_message_at
    conversations.sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
    );

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedConversations = conversations.slice(startIndex, endIndex);

    const response: GetConversationsResponse = {
      conversations: paginatedConversations,
      total: conversations.length,
      page,
      limit,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Unexpected error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

