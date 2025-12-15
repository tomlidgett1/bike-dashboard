// ============================================================
// CONVERSATION DETAIL API ROUTE (OPTIMIZED with RPC)
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
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Single RPC call - fetches everything and marks as read
    const { data: result, error } = await supabase
      .rpc('get_conversation_detail', {
        p_user_id: user.id,
        p_conversation_id: id,
        p_message_limit: limit,
      });

    if (error) {
      console.error('Error fetching conversation:', error);
      return NextResponse.json(
        { error: 'Failed to fetch conversation' },
        { status: 500 }
      );
    }

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 404 }
      );
    }

    const data = result[0];

    // Mark conversation as read - fire and forget (don't block response)
    supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString(), unread_count: 0 })
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .then(() => {});

    // Build response in expected format
    const response: GetConversationResponse = {
      conversation: {
        id: data.conversation_id,
        subject: data.subject,
        status: data.status,
        product_id: data.product_id,
        last_message_at: data.last_message_at,
        message_count: data.message_count,
        created_at: data.created_at,
        updated_at: data.updated_at || data.created_at,
        participants: data.other_user_id ? [{
          user_id: data.other_user_id,
          user: {
            user_id: data.other_user_id,
            name: data.other_user_name,
            business_name: data.other_user_business_name,
            logo_url: data.other_user_logo_url,
          },
        }] : [],
        product: data.product_id ? {
          id: data.product_id,
          description: data.product_description,
          display_name: data.product_display_name,
          price: data.product_price,
          primary_image_url: data.product_image_url,
        } : undefined,
        messages: (data.messages_json || []).map((m: any) => ({
          id: m.id,
          content: m.content,
          sender_id: m.sender_id,
          created_at: m.created_at,
          is_own: m.is_own,
          attachments: [],
        })),
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=5',
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





