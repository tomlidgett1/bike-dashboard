// ============================================================
// Stripe Cart Checkout Session Creation API
// ============================================================
// POST: Creates a single Stripe Checkout Session for a multi-item cart.
//
// Hard rule: every item in the cart must belong to the SAME seller, because
// each seller has their own Stripe Connect account / payout. The single
// payment is later split into one purchase row per product by the webhook,
// each retaining its own escrow + payout (see webhook handleCheckoutComplete).
//
// Pricing is fully re-validated here — the client cart is only a list of ids.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCloudinaryImageUrl, extractCloudinaryPublicId } from '@/lib/utils/cloudinary-transforms';
import { getStripe, calculateBuyerFee } from '@/lib/stripe';
import { resolveLivePrice } from '@/lib/marketplace/pricing';

const UBER_EXPRESS_FEE = 15;
const AUSPOST_FEE = 12;
const MAX_CART_ITEMS = 12;
const MIN_PURCHASE_FOR_VOUCHER_CENTS = 3000;

type DeliveryMethod = 'uber_express' | 'auspost' | 'pickup';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const stripe = getStripe();

    // Auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised - please sign in to purchase' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      items: rawItems,
      productIds: rawProductIds,
      deliveryMethod = 'uber_express',
    } = body as {
      items?: { productId: string; quantity?: number }[];
      productIds?: string[]; // legacy payload — each id treated as quantity 1
      deliveryMethod?: DeliveryMethod;
    };

    // Normalise the payload to a productId -> requested quantity map. Accepts the
    // new {productId, quantity}[] shape and the legacy productIds[] (quantity 1).
    const qtyById = new Map<string, number>();
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      for (const it of rawItems) {
        if (!it || typeof it.productId !== 'string') continue;
        const q = Math.floor(Number(it.quantity));
        const qty = Number.isFinite(q) && q >= 1 ? q : 1;
        qtyById.set(it.productId, (qtyById.get(it.productId) ?? 0) + qty);
      }
    } else if (Array.isArray(rawProductIds)) {
      for (const id of rawProductIds) {
        if (typeof id !== 'string') continue;
        qtyById.set(id, (qtyById.get(id) ?? 0) + 1);
      }
    }

    if (qtyById.size === 0) {
      return NextResponse.json({ error: 'Your cart is empty' }, { status: 400 });
    }

    const ids = [...qtyById.keys()];
    if (ids.length > MAX_CART_ITEMS) {
      return NextResponse.json(
        { error: `A cart can hold at most ${MAX_CART_ITEMS} items` },
        { status: 400 }
      );
    }

    // Fetch all products in one query
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        price,
        discount_percent,
        discount_active,
        discount_ends_at,
        sale_price,
        images,
        user_id,
        is_active,
        sold_at,
        listing_status,
        qoh,
        listing_type
      `)
      .in('id', ids);

    if (productsError) {
      console.error('[Stripe Cart Checkout] Product fetch error:', productsError);
      return NextResponse.json({ error: 'Could not load cart items' }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'Cart items not found' }, { status: 404 });
    }

    // Enforce single-seller cart
    const sellerIds = new Set(products.map((p) => p.user_id));
    if (sellerIds.size > 1) {
      return NextResponse.json(
        { error: 'A cart can only contain items from one seller' },
        { status: 400 }
      );
    }
    const sellerId = products[0].user_id;

    // Prevent buying your own products
    if (sellerId === user.id) {
      return NextResponse.json(
        { error: 'You cannot purchase your own products' },
        { status: 400 }
      );
    }

    // Availability + stock check. `available` is the live purchasable quantity:
    // unique/used listings are always 1; shop inventory uses qoh. When stock is
    // short of the requested amount we return `available` so the client can clamp
    // the line (rather than dropping it); `available: 0` means remove it.
    const foundIds = new Set(products.map((p) => p.id));
    const unavailable: { id: string; name: string; available: number }[] = [];

    for (const id of ids) {
      if (!foundIds.has(id)) unavailable.push({ id, name: 'Item', available: 0 });
    }
    for (const p of products) {
      const name = p.display_name || p.description || 'Item';
      if (!p.is_active || p.sold_at || p.listing_status === 'sold') {
        unavailable.push({ id: p.id, name, available: 0 });
        continue;
      }
      const available =
        p.listing_type === 'private_listing'
          ? 1
          : typeof p.qoh === 'number'
            ? p.qoh
            : 1;
      const requested = qtyById.get(p.id) ?? 1;
      if (available < 1) {
        unavailable.push({ id: p.id, name, available: 0 });
      } else if (requested > available) {
        unavailable.push({ id: p.id, name, available });
      }
    }

    if (unavailable.length > 0) {
      const soldOut = unavailable.filter((u) => u.available < 1);
      const reduced = unavailable.filter((u) => u.available >= 1);
      let error: string;
      if (soldOut.length === 0 && reduced.length === 1) {
        error = `Only ${reduced[0].available} of "${reduced[0].name}" left — we've updated your cart.`;
      } else if (soldOut.length === 0) {
        error = `Some items had less stock than requested — we've updated your cart.`;
      } else if (soldOut.length === 1 && reduced.length === 0) {
        error = `"${soldOut[0].name}" is no longer available`;
      } else {
        error = `Some items in your cart are no longer available`;
      }
      return NextResponse.json({ error, unavailable }, { status: 409 });
    }

    // Re-validate live prices server-side (advertised price = charged price).
    // `price` is the UNIT price; `quantity` is validated above to be <= stock.
    const items = products.map((p) => {
      const live = resolveLivePrice(p);
      return { product: p, price: live.price, onSale: live.onSale, quantity: Math.max(1, qtyById.get(p.id) ?? 1) };
    });

    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const subtotalCents = Math.round(subtotal * 100);
    const buyerFee = calculateBuyerFee(subtotal); // 0.5% buyer service fee on the cart subtotal

    // Delivery — charged once for the whole order (single seller, single shipment)
    let deliveryCost = 0;
    let deliveryDescription = '';
    switch (deliveryMethod) {
      case 'uber_express':
        deliveryCost = UBER_EXPRESS_FEE;
        deliveryDescription = 'Uber Express (1-hour delivery)';
        break;
      case 'pickup':
        deliveryCost = 0;
        deliveryDescription = 'Local Pickup';
        break;
      case 'auspost':
      default:
        deliveryCost = AUSPOST_FEE;
        deliveryDescription = 'Australia Post (2-5 business days)';
        break;
    }

    // Voucher — applied once to the whole cart (platform bears the discount; the
    // per-item seller payout is still computed from the full item price downstream).
    let voucherDiscount = 0;
    let voucherDiscountCents = 0;
    let applicableVoucher: { id: string; amount_cents: number; description: string } | null = null;

    if (subtotalCents >= MIN_PURCHASE_FOR_VOUCHER_CENTS) {
      const { data: voucher } = await supabase
        .from('vouchers')
        .select('id, amount_cents, min_purchase_cents, description, voucher_type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .lte('min_purchase_cents', subtotalCents)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('amount_cents', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (voucher) {
        applicableVoucher = {
          id: voucher.id,
          amount_cents: voucher.amount_cents,
          description: voucher.description || 'Yellow Jersey discount',
        };
        voucherDiscountCents = voucher.amount_cents;
        voucherDiscount = voucherDiscountCents / 100;
      }
    }

    // Best primary image per product for the Stripe line items (single query)
    const imageMap = new Map<string, string>();
    const { data: imageRows } = await supabase
      .from('product_images')
      .select('product_id, cloudinary_public_id, cloudinary_url, external_url, is_primary')
      .in('product_id', ids)
      .eq('approval_status', 'approved')
      .order('is_primary', { ascending: false });

    if (imageRows) {
      for (const row of imageRows) {
        if (imageMap.has(row.product_id)) continue;
        const publicId = row.cloudinary_public_id || extractCloudinaryPublicId(row.cloudinary_url);
        const url =
          buildCloudinaryImageUrl(publicId, 'web_hero') ||
          row.cloudinary_url ||
          row.external_url ||
          undefined;
        if (url && url.startsWith('https://')) imageMap.set(row.product_id, url);
      }
    }

    // One line item per product, using its quantity. The whole-cart voucher is
    // applied to a SINGLE unit of the first product (otherwise a per-unit
    // discount would be multiplied by quantity), so when that product has more
    // than one unit we split it into a discounted unit + the rest at full price.
    const lineItems: any[] = [];
    items.forEach((it, idx) => {
      const fullUnit = Math.round(it.price * 100);
      const img = imageMap.get(it.product.id);
      const baseProductData = {
        name: it.product.display_name || it.product.description,
        description: 'Purchase from Yellow Jersey Marketplace',
        ...(img && { images: [img] }),
      };

      if (idx === 0 && voucherDiscountCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'aud',
            product_data: {
              ...baseProductData,
              description: `Yellow Jersey Marketplace (includes $${voucherDiscount.toFixed(2)} discount)`,
            },
            unit_amount: Math.max(0, fullUnit - voucherDiscountCents),
          },
          quantity: 1,
        });
        if (it.quantity > 1) {
          lineItems.push({
            price_data: {
              currency: 'aud',
              product_data: baseProductData,
              unit_amount: fullUnit,
            },
            quantity: it.quantity - 1,
          });
        }
      } else {
        lineItems.push({
          price_data: {
            currency: 'aud',
            product_data: baseProductData,
            unit_amount: fullUnit,
          },
          quantity: it.quantity,
        });
      }
    });

    if (deliveryCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'aud',
          product_data: { name: deliveryDescription, description: 'Delivery cost' },
          unit_amount: Math.round(deliveryCost * 100),
        },
        quantity: 1,
      });
    }

    if (buyerFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'aud',
          product_data: { name: 'Service Fee', description: 'Yellow Jersey marketplace fee' },
          unit_amount: Math.round(buyerFee * 100),
        },
        quantity: 1,
      });
    }

    const totalAmount = Math.max(0, subtotal + deliveryCost + buyerFee - voucherDiscount);

    // Parallel CSVs carry the charged per-item prices to the webhook so it can
    // create one purchase row per product without re-deriving (and risking a
    // mid-window discount change). Bounded by MAX_CART_ITEMS to stay within
    // Stripe's 500-char metadata value limit.
    const metadata: Record<string, string> = {
      cart: '1',
      buyer_id: user.id,
      seller_id: sellerId,
      product_ids: items.map((it) => it.product.id).join(','),
      item_prices: items.map((it) => it.price).join(','),
      quantities: items.map((it) => it.quantity).join(','),
      item_count: String(items.length),
      delivery_method: deliveryMethod,
      delivery_cost: deliveryCost.toString(),
      delivery_description: deliveryDescription,
      buyer_fee: buyerFee.toString(),
      subtotal: subtotal.toString(),
      total_amount: totalAmount.toString(),
    };

    if (applicableVoucher) {
      metadata.voucher_id = applicableVoucher.id;
      metadata.voucher_discount = voucherDiscount.toString();
      metadata.voucher_discount_cents = voucherDiscountCents.toString();
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const requiresShipping = deliveryMethod !== 'pickup';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      ...(requiresShipping && {
        shipping_address_collection: {
          allowed_countries: ['AU', 'NZ'],
        },
      }),
      phone_number_collection: { enabled: true },
      metadata,
      success_url: `${appUrl}/marketplace/checkout/success?session_id={CHECKOUT_SESSION_ID}&cart=1`,
      cancel_url: `${appUrl}/marketplace`,
      customer_email: user.email,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    if (!session.url) {
      console.error('[Stripe Cart Checkout] No session URL returned');
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    console.log('[Stripe Cart Checkout] Session created:', {
      sessionId: session.id,
      buyerId: user.id,
      sellerId,
      itemCount: items.length,
      total: totalAmount,
      voucherApplied: !!applicableVoucher,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      voucher: applicableVoucher
        ? { id: applicableVoucher.id, discount: voucherDiscount, description: applicableVoucher.description }
        : null,
    });
  } catch (error) {
    console.error('[Stripe Cart Checkout] Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
