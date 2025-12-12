// ============================================================
// Stripe Session Details API
// ============================================================
// GET: Fetch purchase details by Stripe session ID

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createClient();
    const { sessionId } = await params;

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

    // Fetch purchase by session ID
    const { data: purchase, error: purchaseError } = await supabase
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
        product:products(
          id,
          description,
          display_name,
          primary_image_url
        ),
        seller:users!purchases_seller_id_fkey(
          user_id,
          name,
          business_name
        )
      `)
      .eq('stripe_session_id', sessionId)
      .eq('buyer_id', user.id) // Security: only allow viewing own purchases
      .single();

    if (purchaseError || !purchase) {
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

