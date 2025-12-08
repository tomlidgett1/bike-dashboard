// ============================================================
// UNREAD OFFERS COUNT API ROUTE
// ============================================================
// GET: Get total unread/pending offers count for current user

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

    // Count pending offers where user is the seller (received offers)
    const { count, error } = await supabase
      .from('offers')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', user.id)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching unread offers count:', error);
      return NextResponse.json(
        { error: 'Failed to fetch unread offers count' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { count: count || 0 },
      {
        headers: {
          'Cache-Control': 'private, max-age=10', // Cache for 10 seconds
        },
      }
    );
  } catch (error) {
    console.error('Unexpected error fetching unread offers count:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}





