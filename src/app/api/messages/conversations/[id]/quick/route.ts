// ============================================================
// QUICK CONVERSATION MESSAGES API
// ============================================================
// Ultra-fast endpoint for mobile sheet - just messages, no extras

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Single query: verify participant and get messages in one go
    const [participantResult, messagesResult] = await Promise.all([
      supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('conversation_id', id)
        .eq('user_id', user.id)
        .single(),
      
      supabase
        .from('messages')
        .select('id, content, sender_id, created_at')
        .eq('conversation_id', id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(50)
    ]);

    if (participantResult.error || !participantResult.data) {
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 404 }
      );
    }

    // Mark as read in background (don't block response)
    supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString(), unread_count: 0 })
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .then(() => {});

    return NextResponse.json({
      messages: (messagesResult.data || []).map(m => ({
        id: m.id,
        content: m.content,
        sender_id: m.sender_id,
        created_at: m.created_at,
        is_own: m.sender_id === user.id,
      })),
    }, {
      headers: {
        'Cache-Control': 'private, max-age=5',
      },
    });
  } catch (error) {
    console.error('Quick conversation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

