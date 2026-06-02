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
    // Cart orders create one purchase row per product under a single session;
    // multi=1 returns the whole set instead of a single row.
    const multi = searchParams.get('multi') === '1';

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

    // `quantity` was added later; build the select with or without it so the
    // success page keeps working if the migration hasn't been applied yet.
    const buildSelect = (withQuantity: boolean) => `
        id,
        order_number,
        item_price,${withQuantity ? '\n        quantity,' : ''}
        shipping_cost,
        total_amount,
        status,
        payment_status,
        purchase_date,
        shipping_method,
        product:products(
          id,
          description,
          display_name,
          primary_image_url
        ),
        seller_id
      `;

    // True only when the failure is specifically the missing `quantity` column,
    // so we retry without it rather than masking unrelated errors.
    const isMissingQuantity = (err: { code?: string; message?: string } | null) =>
      !!err && (err.code === '42703' || /quantity/i.test(err.message || ''));
    const normalizePurchase = (purchase: unknown) => {
      const row = purchase as Record<string, unknown>;
      return {
        ...row,
        delivery_method: row.shipping_method,
      };
    };

    // Multi-item (cart) lookup — always keyed by session id
    if (multi) {
      const runMulti = (sel: string) =>
        supabase
          .from('purchases')
          .select(sel)
          .eq('buyer_id', user.id) // Security: only allow viewing own purchases
          .eq('stripe_session_id', sessionId)
          .order('purchase_date', { ascending: true });

      let { data: purchases, error: purchasesError } = await runMulti(buildSelect(true));
      if (isMissingQuantity(purchasesError)) {
        ({ data: purchases, error: purchasesError } = await runMulti(buildSelect(false)));
      }

      if (purchasesError) {
        console.log('[Session API] Cart purchases lookup failed:', { sessionId, error: purchasesError.message });
        return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
      }

      return NextResponse.json({
        purchases: (purchases || []).map(normalizePurchase),
      });
    }

    const runSingle = (sel: string) => {
      let query = supabase
        .from('purchases')
        .select(sel)
        .eq('buyer_id', user.id); // Security: only allow viewing own purchases
      query =
        type === 'payment_intent'
          ? query.eq('stripe_payment_intent_id', sessionId)
          : query.eq('stripe_session_id', sessionId);
      return query.single();
    };

    let { data: purchase, error: purchaseError } = await runSingle(buildSelect(true));
    if (isMissingQuantity(purchaseError)) {
      ({ data: purchase, error: purchaseError } = await runSingle(buildSelect(false)));
    }

    if (purchaseError || !purchase) {
      console.log('[Session API] Purchase not found:', { sessionId, type, error: purchaseError?.message });
      return NextResponse.json(
        { error: 'Purchase not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      purchase: normalizePurchase(purchase),
    });

  } catch (error) {
    console.error('[Session API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
