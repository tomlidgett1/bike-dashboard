// ============================================================
// UNREAD COUNT API ROUTE
// ============================================================
// GET: Get total unread message count for current user

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserUnreadMessageCount } from '@/lib/server/get-user-unread-count';
import type { UnreadCountResponse } from '@/lib/types/message';

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

    const { count, error } = await getUserUnreadMessageCount(supabase, user.id);

    if (error) {
      console.error('Error fetching unread count:', error);
      return NextResponse.json(
        { error: 'Failed to fetch unread count' },
        { status: 500 }
      );
    }

    const response: UnreadCountResponse = {
      count,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=10', // Cache for 10 seconds
      },
    });
  } catch (error) {
    console.error('Unexpected error fetching unread count:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}











