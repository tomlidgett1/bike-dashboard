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
// GET: List user's conversations (OPTIMIZED with RPC)
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
    const archived = searchParams.get('archived') === 'true';
    const offset = (page - 1) * limit;

    // Single RPC call - all logic happens in the database
    const { data: rawConversations, error } = await supabase
      .rpc('get_conversations_list', {
        p_user_id: user.id,
        p_archived: archived,
        p_limit: limit,
        p_offset: offset,
      });

    if (error) {
      console.error('Error fetching conversations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      );
    }

    // Transform to expected format
    const conversations: ConversationListItem[] = (rawConversations || []).map((c: any) => ({
      id: c.conversation_id,
      subject: c.subject,
      status: c.status,
      last_message_at: c.last_message_at,
      message_count: c.message_count,
      unread_count: c.unread_count,
      is_archived: c.is_archived,
      other_participants: c.other_user_id ? [{
        user_id: c.other_user_id,
        name: c.other_user_name || '',
        business_name: c.other_user_business_name || '',
        logo_url: c.other_user_logo_url || null,
      }] : [],
      product: c.product_id ? {
        id: c.product_id,
        description: c.product_description,
        display_name: c.product_display_name,
        primary_image_url: c.product_image_url,
      } : undefined,
      last_message: c.last_message_content ? {
        content: c.last_message_content,
        sender_id: c.last_message_sender_id,
        created_at: c.last_message_created_at,
      } : undefined,
    }));

    const response: GetConversationsResponse = {
      conversations,
      total: conversations.length,
      page,
      limit,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=5',
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

