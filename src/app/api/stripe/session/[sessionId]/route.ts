// ============================================================
// Stripe Session Details API
// ============================================================
// GET: Fetch purchase details by Stripe session ID or payment intent ID

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createClient();
    const { sessionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    // Build query based on type
    let query = supabase
      .from('purchases')
      .select(`
        id,
        order_number,
        item_price,
        shipping_cost,
        total_amount,
        status,
        payment_status,
        purchase_date,
        delivery_method,
        product:products(
          id,
          description,
          display_name,
          primary_image_url
        ),
        seller_id
      `)
      .eq('buyer_id', user.id); // Security: only allow viewing own purchases

    // Lookup by payment_intent or session_id
    if (type === 'payment_intent') {
      query = query.eq('stripe_payment_intent_id', sessionId);
    } else {
      query = query.eq('stripe_session_id', sessionId);
    }

    const { data: purchase, error: purchaseError } = await query.single();

    if (purchaseError || !purchase) {
      console.log('[Session API] Purchase not found:', { sessionId, type, error: purchaseError?.message });
      return NextResponse.json(
        { error: 'Purchase not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ purchase });

  } catch (error) {
    console.error('[Session API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

