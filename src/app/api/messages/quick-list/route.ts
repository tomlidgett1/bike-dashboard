// ============================================================
// QUICK MESSAGES LIST API
// ============================================================
// Ultra-fast single RPC call for mobile messages panel

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Single RPC call - all logic happens in the database
    const { data: conversations, error } = await supabase
      .rpc('get_quick_conversations', {
        p_user_id: user.id,
        p_limit: limit,
      });

    if (error) {
      console.error('Error fetching quick messages:', error);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    // Transform to expected format
    const result = (conversations || []).map((c: any) => ({
      id: c.conversation_id,
      conversation_id: c.conversation_id,
      subject: c.subject,
      unread_count: c.unread_count,
      is_read: c.is_read,
      created_at: c.last_message_at,
      sender: {
        name: c.sender_name,
        business_name: c.sender_business_name,
      },
      message: c.last_message_content ? {
        content: c.last_message_content,
      } : undefined,
    }));

    return NextResponse.json({
      conversations: result,
      total: result.length,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=10',
      },
    });
  } catch (error) {
    console.error('Unexpected error in quick-list:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
