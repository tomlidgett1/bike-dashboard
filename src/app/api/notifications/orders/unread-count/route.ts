// ============================================================
// ORDER NOTIFICATIONS UNREAD COUNT API
// ============================================================
// GET: Return count of unread order notifications

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

    // Count unread order notifications
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('notification_category', 'order')
      .eq('is_read', false);

    if (error) {
      console.error('Error counting unread notifications:', error);
      return NextResponse.json(
        { error: 'Failed to count notifications' },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count || 0 }, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Unexpected error counting notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}




