// ============================================================
// Stripe Session Details API
// ============================================================
// GET: Fetch purchase details by Stripe session ID or payment intent ID

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProductCardUrl } from '@/lib/services/product-images';

type SessionProduct = {
  id?: string | null;
  canonical_product_id?: string | null;
  primary_image_url?: string | null;
  cached_image_url?: string | null;
  images?: unknown;
  [key: string]: unknown;
};

type SessionPurchase = {
  product_id?: string | null;
  product?: SessionProduct | SessionProduct[] | null;
  [key: string]: unknown;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function firstLegacyImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;

  for (const image of images) {
    if (typeof image === 'string' && image.trim()) return image;
    if (image && typeof image === 'object') {
      const url = (image as { detailUrl?: unknown; cardUrl?: unknown; url?: unknown }).detailUrl
        || (image as { cardUrl?: unknown }).cardUrl
        || (image as { url?: unknown }).url;

      if (typeof url === 'string' && url.trim()) return url;
    }
  }

  return null;
}

async function enrichProductImage(
  supabase: SupabaseServerClient,
  product: SessionProduct | null,
  fallbackProductId?: string | null
): Promise<SessionProduct | null> {
  if (!product) return null;

  const productId = product.id || fallbackProductId || null;
  const resolvedImageUrl = productId
    ? await getProductCardUrl(supabase, productId, product.canonical_product_id || null)
    : null;

  return {
    ...product,
    primary_image_url:
      resolvedImageUrl
      || product.cached_image_url
      || product.primary_image_url
      || firstLegacyImage(product.images),
  };
}

async function normalizePurchase(
  supabase: SupabaseServerClient,
  purchase: unknown
): Promise<SessionPurchase> {
  const row = purchase as SessionPurchase;
  const product = row.product;
  const enrichedProduct: SessionProduct | SessionProduct[] | null = Array.isArray(product)
    ? (await Promise.all(product.map((item) => enrichProductImage(supabase, item, row.product_id))))
        .filter((item): item is SessionProduct => item !== null)
    : await enrichProductImage(supabase, product || null, row.product_id);

  return {
    ...row,
    product: enrichedProduct,
    delivery_method: row.shipping_method,
  };
}

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
        product_id,
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
          canonical_product_id,
          primary_image_url,
          cached_image_url,
          images
        ),
        seller_id
      `;

    // True only when the failure is specifically the missing `quantity` column,
    // so we retry without it rather than masking unrelated errors.
    const isMissingQuantity = (err: { code?: string; message?: string } | null) =>
      !!err && (err.code === '42703' || /quantity/i.test(err.message || ''));

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
        purchases: await Promise.all((purchases || []).map((row) => normalizePurchase(supabase, row))),
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
      purchase: await normalizePurchase(supabase, purchase),
    });

  } catch (error) {
    console.error('[Session API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
