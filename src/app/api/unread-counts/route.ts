// ============================================================
// COMBINED UNREAD COUNTS API ROUTE
// ============================================================
// GET: Get both messages and offers unread counts in a single call
// Much faster than making two separate API calls

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface CombinedUnreadCountsResponse {
  messages: number;
  offers: number;
  total: number;
}

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

    // Fetch both counts in parallel for maximum speed
    const [messagesResult, offersResult] = await Promise.all([
      // Get unread message count using the database function
      supabase.rpc('get_user_unread_count', {
        p_user_id: user.id,
      }),
      // Get pending offers count
      supabase
        .from('offers')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('status', 'pending'),
    ]);

    const messagesCount = messagesResult.data || 0;
    const offersCount = offersResult.count || 0;

    const response: CombinedUnreadCountsResponse = {
      messages: messagesCount,
      offers: offersCount,
      total: messagesCount + offersCount,
    };

    return NextResponse.json(response, {
      headers: {
        // Cache for 30 seconds with stale-while-revalidate for 60 seconds
        // This means users get fresh data within 30s, but can get stale data
        // if it's being revalidated, reducing perceived latency
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Unexpected error fetching combined unread counts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

