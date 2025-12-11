// ============================================================
// ARCHIVE CONVERSATION API ROUTE
// ============================================================
// PATCH: Archive or unarchive a conversation for the current user

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { archived } = body;

    if (typeof archived !== 'boolean') {
      return NextResponse.json(
        { error: 'archived field must be a boolean' },
        { status: 400 }
      );
    }

    // Update participant's archived status
    const { data, error } = await supabase
      .from('conversation_participants')
      .update({ is_archived: archived })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error archiving conversation:', error);
      return NextResponse.json(
        { error: 'Failed to archive conversation' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Conversation not found or not a participant' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      archived: data.is_archived,
    });
  } catch (error) {
    console.error('Unexpected error archiving conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}







