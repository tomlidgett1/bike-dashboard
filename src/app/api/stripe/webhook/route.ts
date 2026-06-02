// ============================================================
// Stripe Webhook Handler
// ============================================================
// Handles Stripe webhook events for payment confirmation
// Creates purchase records and marks products as sold

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe, calculatePlatformFee, calculateSellerPayout } from '@/lib/stripe';
import Stripe from 'stripe';
import { LightspeedClient } from '@/lib/services/lightspeed/lightspeed-client';

// Use service role client for webhook operations (bypasses RLS)
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('[Stripe Webhook] Supabase URL exists:', !!supabaseUrl);
  console.log('[Stripe Webhook] Supabase Service Key exists:', !!supabaseServiceKey);

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Stripe Webhook] MISSING ENV VARS:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
    });
    throw new Error('Missing Supabase environment variables - SUPABASE_SERVICE_ROLE_KEY required');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Disable body parsing - Stripe needs the raw body for signature verification
export const runtime = 'nodejs';

// Health check endpoint
export async function GET() {
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;

  return NextResponse.json({
    status: 'ok',
    webhook: 'active',
    config: {
      STRIPE_WEBHOOK_SECRET: hasWebhookSecret ? '✓ Set' : '✗ MISSING',
      SUPABASE_SERVICE_ROLE_KEY: hasServiceKey ? '✓ Set' : '✗ MISSING',
      NEXT_PUBLIC_SUPABASE_URL: hasSupabaseUrl ? '✓ Set' : '✗ MISSING',
      STRIPE_SECRET_KEY: hasStripeKey ? '✓ Set' : '✗ MISSING',
    },
  });
}

export async function POST(request: NextRequest) {
  console.log('[Stripe Webhook] ========== WEBHOOK REQUEST RECEIVED ==========');
  console.log('[Stripe Webhook] Timestamp:', new Date().toISOString());
  
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('[Stripe Webhook] Has webhook secret:', !!webhookSecret);
  console.log('[Stripe Webhook] Secret length:', webhookSecret?.length || 0);

  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // Get the raw body and signature
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  console.log('[Stripe Webhook] Body length:', body.length);
  console.log('[Stripe Webhook] Has signature:', !!signature);
  console.log('[Stripe Webhook] Signature preview:', signature?.substring(0, 50) + '...');

  if (!signature) {
    console.error('[Stripe Webhook] No signature header');
    return NextResponse.json(
      { error: 'No signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  // Verify webhook signature
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    console.log('[Stripe Webhook] ✓ Signature verified successfully');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe Webhook] ✗ Signature verification FAILED:', message);
    console.error('[Stripe Webhook] This usually means STRIPE_WEBHOOK_SECRET is wrong');
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  console.log('[Stripe Webhook] ✓ Received event:', event.type, event.id);

  // Handle the event
  try {
    console.log('[Stripe Webhook] Processing event type:', event.type);
    
    switch (event.type) {
      case 'checkout.session.completed': {
        console.log('[Stripe Webhook] >>> HANDLING checkout.session.completed <<<');
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        console.log('[Stripe Webhook] >>> COMPLETED checkout.session.completed <<<');
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[Stripe Webhook] Checkout session expired:', session.id);
        // No action needed - product remains available
        break;
      }

      case 'payment_intent.succeeded': {
        console.log('[Stripe Webhook] >>> HANDLING payment_intent.succeeded <<<');
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(paymentIntent);
        console.log('[Stripe Webhook] >>> COMPLETED payment_intent.succeeded <<<');
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('[Stripe Webhook] Payment failed:', paymentIntent.id);
        
        // Handle offer payment failure
        const failedMetadata = paymentIntent.metadata;
        if (failedMetadata?.offer_id && failedMetadata?.payment_type === 'offer') {
          const supabase = getServiceClient();
          await supabase
            .from('offers')
            .update({ 
              payment_status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', failedMetadata.offer_id);
          console.log('[Stripe Webhook] Offer payment status set to failed:', failedMetadata.offer_id);
        }
        break;
      }

      // ============================================================
      // Stripe Connect Account Events
      // ============================================================

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await handleAccountUpdated(account);
        break;
      }

      case 'account.application.deauthorized': {
        const application = event.data.object as Stripe.Application;
        console.log('[Stripe Webhook] Account deauthorized:', application.id);
        // Handle account disconnection if needed
        break;
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('[Stripe Webhook] Error handling event:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// ============================================================
// Handle Successful Checkout
// ============================================================

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  console.log('[Stripe Webhook] ====== CHECKOUT COMPLETE START ======');
  console.log('[Stripe Webhook] Session ID:', session.id);
  console.log('[Stripe Webhook] Payment Status:', session.payment_status);
  console.log('[Stripe Webhook] Amount Total:', session.amount_total);
  
  const supabase = getServiceClient();

  console.log('[Stripe Webhook] Supabase client created');

  // Extract metadata
  const metadata = session.metadata;
  console.log('[Stripe Webhook] Metadata:', JSON.stringify(metadata, null, 2));
  
  if (!metadata) {
    console.error('[Stripe Webhook] No metadata in session - ABORTING');
    return;
  }

  // Cart checkout — one payment split into one purchase row per product.
  // Handled separately because there is no single product_id in the metadata.
  if (metadata.cart === '1') {
    await handleCartCheckoutComplete(session, metadata, supabase);
    return;
  }

  // Check if this is an offer payment
  const isOfferPayment = metadata.payment_type === 'offer' && metadata.offer_id;
  
  if (isOfferPayment) {
    console.log('[Stripe Webhook] >>> OFFER PAYMENT DETECTED <<<');
    console.log('[Stripe Webhook] Offer ID:', metadata.offer_id);
  }

  const {
    product_id,
    buyer_id,
    seller_id,
    item_price,
    shipping_cost,
    buyer_fee,
    total_amount,
    platform_fee,
    seller_payout,
    offer_id,
    voucher_id,
    voucher_discount,
    voucher_discount_cents,
  } = metadata;

  // Log voucher info if present
  if (voucher_id) {
    console.log('[Stripe Webhook] >>> VOUCHER APPLIED <<<');
    console.log('[Stripe Webhook] Voucher ID:', voucher_id);
    console.log('[Stripe Webhook] Voucher Discount:', voucher_discount);
  }

  console.log('[Stripe Webhook] Extracted IDs:', { product_id, buyer_id, seller_id });

  if (!product_id || !buyer_id || !seller_id) {
    console.error('[Stripe Webhook] Missing required metadata - ABORTING:', metadata);
    return;
  }

  // Check for idempotency - don't create duplicate purchases
  const { data: existingPurchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('stripe_session_id', session.id)
    .single();

  if (existingPurchase) {
    console.log('[Stripe Webhook] Purchase already exists for session:', session.id);
    return;
  }

  // Verify product is still available (race condition protection).
  // Also fetch lightspeed_item_id to create a quote sale in the seller's
  // Lightspeed account for Lightspeed-sourced products.
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, is_active, sold_at, lightspeed_item_id, listing_source')
    .eq('id', product_id)
    .single();

  if (productError || !product) {
    console.error('[Stripe Webhook] Product not found:', product_id);
    // Still create purchase record for refund handling
  }

  if (product?.sold_at) {
    console.error('[Stripe Webhook] Product already sold:', product_id);
    // TODO: Trigger automatic refund
    return;
  }

  // Generate order number
  const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Calculate funds release date (7 days from now)
  const fundsReleaseAt = new Date();
  fundsReleaseAt.setDate(fundsReleaseAt.getDate() + 7);

  // Extract shipping address from session
  // Use type assertion since Stripe's types may not include all fields
  const sessionAny = session as any;
  const shippingDetails = sessionAny.shipping_details || sessionAny.collected_information?.shipping_details;
  const customerDetails = session.customer_details;

  // Shipping address ONLY — the address the buyer entered for delivery at
  // checkout. No billing fallback: a pickup order has no shipping address, so
  // shippingAddress stays null and the workorder note reads "Pickup".
  const addr = shippingDetails?.address;

  // Format shipping address as JSON
  const shippingAddress = addr ? {
    name: shippingDetails?.name || customerDetails?.name || '',
    phone: customerDetails?.phone || '',
    line1: addr.line1 || '',
    line2: addr.line2 || '',
    city: addr.city || '',
    state: addr.state || '',
    postal_code: addr.postal_code || '',
    country: addr.country || '',
  } : null;

  console.log('[Stripe Webhook] Shipping address:', JSON.stringify(shippingAddress, null, 2));

  // Create purchase record with escrow fields
  // Note: Only include fields that exist in the database
  const purchaseData: Record<string, any> = {
    buyer_id,
    seller_id,
    product_id,
    order_number: orderNumber,
    item_price: parseFloat(item_price),
    shipping_cost: parseFloat(shipping_cost || '0'),
    total_amount: parseFloat(total_amount),
    platform_fee: parseFloat(platform_fee),
    seller_payout_amount: parseFloat(seller_payout),
    stripe_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === 'string' 
      ? session.payment_intent 
      : session.payment_intent?.id || null,
    status: 'paid',
    payment_status: 'paid',
    payment_method: 'stripe',
    payment_date: new Date().toISOString(),
    payout_status: 'pending',
    // Escrow fields
    funds_status: 'held',
    funds_release_at: fundsReleaseAt.toISOString(),
  };

  // Add optional fields if they have values (columns may not exist yet)
  if (shippingAddress) {
    purchaseData.shipping_address = shippingAddress;
  }
  if (customerDetails?.phone) {
    purchaseData.buyer_phone = customerDetails.phone;
  }
  if (customerDetails?.email) {
    purchaseData.buyer_email = customerDetails.email;
  }
  if (buyer_fee) {
    purchaseData.buyer_fee = parseFloat(buyer_fee);
  }
  // Link to offer if this is an offer payment
  if (offer_id) {
    purchaseData.offer_id = offer_id;
    purchaseData.original_price = parseFloat(metadata.original_price || item_price);
    console.log('[Stripe Webhook] Purchase linked to offer:', offer_id);
  }
  
  // Add voucher info if this purchase used a voucher
  if (voucher_id) {
    purchaseData.voucher_id = voucher_id;
    purchaseData.voucher_discount = parseFloat(voucher_discount || '0');
    console.log('[Stripe Webhook] Purchase linked to voucher:', voucher_id);
  }

  console.log('[Stripe Webhook] Inserting purchase with data:', JSON.stringify(purchaseData, null, 2));

  // Try to insert with all fields, fallback to core fields if new columns don't exist
  let purchase: any;
  let purchaseError: any;

  // First attempt with all fields
  const result1 = await supabase
    .from('purchases')
    .insert(purchaseData)
    .select()
    .single();

  if (result1.error) {
    console.log('[Stripe Webhook] First insert attempt failed, trying with core fields only');
    console.log('[Stripe Webhook] Error was:', result1.error.message);
    
    // Remove potentially missing columns and retry
    const coreData = {
      buyer_id,
      seller_id,
      product_id,
      order_number: orderNumber,
      item_price: parseFloat(item_price),
      shipping_cost: parseFloat(shipping_cost || '0'),
      total_amount: parseFloat(total_amount),
      platform_fee: parseFloat(platform_fee),
      seller_payout_amount: parseFloat(seller_payout),
      stripe_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' 
        ? session.payment_intent 
        : session.payment_intent?.id || null,
      status: 'paid',
      payment_status: 'paid',
      payment_method: 'stripe',
      payment_date: new Date().toISOString(),
      payout_status: 'pending',
      funds_status: 'held',
      funds_release_at: fundsReleaseAt.toISOString(),
    };

    const result2 = await supabase
      .from('purchases')
      .insert(coreData)
      .select()
      .single();

    purchase = result2.data;
    purchaseError = result2.error;
  } else {
    purchase = result1.data;
    purchaseError = result1.error;
  }

  if (purchaseError) {
    console.error('[Stripe Webhook] ✗ Failed to create purchase:', JSON.stringify(purchaseError, null, 2));
    console.error('[Stripe Webhook] Error code:', purchaseError.code);
    console.error('[Stripe Webhook] Error message:', purchaseError.message);
    console.error('[Stripe Webhook] Error details:', purchaseError.details);
    throw purchaseError;
  }

  console.log('[Stripe Webhook] ✓ Purchase created:', purchase.id, orderNumber);

  // Mark product as sold
  const { error: updateError } = await supabase
    .from('products')
    .update({
      sold_at: new Date().toISOString(),
      is_active: false,
      listing_status: 'sold',
    })
    .eq('id', product_id)
    .is('sold_at', null); // Only update if not already sold (atomic check)

  if (updateError) {
    console.error('[Stripe Webhook] Failed to mark product as sold:', updateError);
    // Don't throw - purchase is already created
  } else {
    console.log('[Stripe Webhook] Product marked as sold:', product_id);
  }

  // ============================================================
  // Create Lightspeed YELLOW JERSEY SALE Workorder (if Lightspeed product)
  // ============================================================
  // Non-fatal: LS errors are logged but never bubble up to Stripe.
  if (product?.lightspeed_item_id) {
    const workorderId = await createLightspeedYellowJerseyWorkorder({
      sellerId: seller_id,
      items: [{ lightspeedItemId: product.lightspeed_item_id, quantity: 1, unitPrice: parseFloat(item_price) }],
      orderNumber,
      buyerName: shippingAddress?.name || customerDetails?.name || null,
      shippingAddress: formatShippingAddressLine(shippingAddress),
    });
    // Persist the LS workorder ID for cross-reference if the column exists.
    if (workorderId) {
      await supabase
        .from('purchases')
        .update({ lightspeed_workorder_id: workorderId })
        .eq('id', purchase.id)
        .then(({ error }) => {
          if (error) console.warn('[Stripe Webhook] Could not store lightspeed_workorder_id (pre-migration?):', error.message);
        });
    }
  }

  // ============================================================
  // Handle Offer Payment - Update offer status
  // ============================================================
  if (offer_id) {
    console.log('[Stripe Webhook] Updating offer payment status for:', offer_id);
    
    const { error: offerUpdateError } = await supabase
      .from('offers')
      .update({
        payment_status: 'paid',
        purchase_id: purchase.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', offer_id);

    if (offerUpdateError) {
      console.error('[Stripe Webhook] Failed to update offer payment status:', offerUpdateError);
      // Don't throw - purchase is already created
    } else {
      console.log('[Stripe Webhook] ✓ Offer payment status updated to paid:', offer_id);
    }

    // Reject all other pending offers on this product (if not already done)
    const { error: rejectError } = await supabase
      .from('offers')
      .update({ 
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('product_id', product_id)
      .neq('id', offer_id)
      .in('status', ['pending', 'countered']);

    if (rejectError) {
      console.error('[Stripe Webhook] Failed to reject other offers:', rejectError);
    } else {
      console.log('[Stripe Webhook] Other pending offers rejected for product:', product_id);
    }
  }

  // ============================================================
  // Handle Voucher Usage - Mark voucher as used
  // ============================================================
  if (voucher_id) {
    console.log('[Stripe Webhook] Marking voucher as used:', voucher_id);
    
    const { error: voucherUpdateError } = await supabase
      .from('vouchers')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_on_purchase_id: purchase.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', voucher_id)
      .eq('status', 'active'); // Only update if still active (idempotency)

    if (voucherUpdateError) {
      console.error('[Stripe Webhook] Failed to mark voucher as used:', voucherUpdateError);
      // Don't throw - purchase is already created, voucher will be handled manually
    } else {
      console.log('[Stripe Webhook] ✓ Voucher marked as used:', voucher_id);
    }
  }

  // ============================================================
  // Create purchase email notifications for buyer and seller
  // ============================================================
  if (purchase?.id) {
    const notificationsToInsert = [
      {
        user_id: buyer_id,
        type: 'purchase_complete',
        notification_category: 'transaction',
        priority: 'critical',
        purchase_id: purchase.id,
        email_delivery_status: 'pending',
      },
      {
        user_id: seller_id,
        type: 'listing_sold',
        notification_category: 'transaction',
        priority: 'high',
        purchase_id: purchase.id,
        email_delivery_status: 'pending',
      },
    ];

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notificationsToInsert);

    if (notifError) {
      // Non-fatal: log but don't fail the webhook
      console.error('[Stripe Webhook] Failed to create purchase notifications:', notifError.message);
    } else {
      console.log('[Stripe Webhook] ✓ Purchase notifications queued for buyer and seller');
    }
  }

  // Save shipping address to buyer profile if not already set
  await maybeSaveShippingAddressToProfile(supabase, buyer_id, shippingAddress);

  console.log(`[Stripe Webhook] Funds held until: ${fundsReleaseAt.toISOString()}`);
  console.log('[Stripe Webhook] ====== CHECKOUT COMPLETE SUCCESS ======');
}

// ============================================================
// Lightspeed YELLOW JERSEY SALE Workorder Creation
// ============================================================
// When a Lightspeed-sourced product is purchased we do NOT complete a sale or
// deduct stock-on-hand in the seller's Lightspeed account. Instead we create a
// Workorder titled "YELLOW JERSEY SALE" whose note highlights all the order
// details. The store reviews the workorder and processes the sale (and the
// stock adjustment) themselves. Non-fatal — if LS is unreachable or the seller
// has no connection, we log and move on so the Stripe webhook always returns
// 200 and the purchase record is preserved.

async function createLightspeedYellowJerseyWorkorder(args: {
  sellerId: string
  items: Array<{ lightspeedItemId: string; quantity: number; unitPrice: number }>
  orderNumber: string
  buyerName?: string | null
  shippingAddress?: string | null
}): Promise<string | null> {
  try {
    const client = new LightspeedClient(args.sellerId)
    const workorder = await client.createYellowJerseySaleWorkorder({
      items: args.items.map((it) => ({
        itemID: it.lightspeedItemId,
        unitQuantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
      orderNumber: args.orderNumber,
      buyerName: args.buyerName,
      shippingAddress: args.shippingAddress,
    })
    console.log(
      '[Stripe Webhook] ✓ Lightspeed YELLOW JERSEY SALE workorder created:',
      workorder.workorderID,
      'for order:',
      args.orderNumber
    )
    return workorder.workorderID
  } catch (err) {
    console.error('[Stripe Webhook] Lightspeed workorder creation failed (non-fatal):', err)
    return null
  }
}

// Save shipping address to user profile if they don't already have one saved.
// Non-fatal — runs after the purchase record is committed.
async function maybeSaveShippingAddressToProfile(
  supabase: ReturnType<typeof getServiceClient>,
  buyerId: string,
  shippingAddress: Record<string, any> | null
): Promise<void> {
  if (!shippingAddress || !shippingAddress.line1) return;

  try {
    const { data: user } = await supabase
      .from('users')
      .select('shipping_address')
      .eq('user_id', buyerId)
      .single();

    if (!user || user.shipping_address) return;

    await supabase
      .from('users')
      .update({ shipping_address: shippingAddress })
      .eq('user_id', buyerId);

    console.log('[Stripe Webhook] ✓ Shipping address saved to buyer profile:', buyerId);
  } catch (err) {
    console.error('[Stripe Webhook] Failed to save shipping address to profile (non-fatal):', err);
  }
}

// Format a stored shipping_address object into a single line for the workorder note.
function formatShippingAddressLine(addr: Record<string, any> | null | undefined): string | null {
  if (!addr) return null
  const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

// ============================================================
// Handle Successful Cart Checkout
// ============================================================
// One Stripe payment → one purchase row per product, all sharing the same
// stripe_session_id. Per-item platform_fee/seller_payout are derived from each
// item's price (matching the single-item flow). Delivery, buyer fee and any
// voucher discount are attributed to the FIRST row so the row totals sum to the
// charged amount. Idempotent per (session, product): a retry skips products
// that already have a row.

async function handleCartCheckoutComplete(
  session: Stripe.Checkout.Session,
  metadata: Stripe.Metadata,
  supabase: ReturnType<typeof getServiceClient>
) {
  console.log('[Stripe Webhook] ====== CART CHECKOUT COMPLETE START ======');
  console.log('[Stripe Webhook] Session ID:', session.id);

  const {
    buyer_id,
    seller_id,
    product_ids,
    item_prices,
    quantities,
    delivery_method,
    delivery_cost,
    delivery_description,
    buyer_fee,
    voucher_id,
    voucher_discount,
  } = metadata;

  if (!buyer_id || !seller_id || !product_ids || !item_prices) {
    console.error('[Stripe Webhook] Cart: missing required metadata - ABORTING:', metadata);
    return;
  }

  const productIds = product_ids.split(',').map((s) => s.trim()).filter(Boolean);
  const itemPrices = item_prices.split(',').map((s) => parseFloat(s.trim()));
  // Per-product unit counts. Sessions created before quantity support have no
  // `quantities` metadata — every line defaults to 1.
  const itemQuantities = (quantities || '').split(',').map((s) => parseInt(s.trim(), 10));

  if (productIds.length === 0 || productIds.length !== itemPrices.length) {
    console.error('[Stripe Webhook] Cart: product/price count mismatch - ABORTING', {
      products: productIds.length,
      prices: itemPrices.length,
    });
    return;
  }

  const deliveryCost = parseFloat(delivery_cost || '0');
  const buyerFee = parseFloat(buyer_fee || '0');
  const voucherDiscount = parseFloat(voucher_discount || '0');

  // Idempotency — find which products already have a row for this session so a
  // webhook retry resumes instead of duplicating.
  const { data: existingRows } = await supabase
    .from('purchases')
    .select('id, product_id')
    .eq('stripe_session_id', session.id);

  const alreadyInserted = new Set((existingRows || []).map((r) => r.product_id));
  if (alreadyInserted.size >= productIds.length) {
    console.log('[Stripe Webhook] Cart: all purchases already exist for session:', session.id);
    return;
  }
  if (alreadyInserted.size > 0) {
    console.log('[Stripe Webhook] Cart: resuming — already have', alreadyInserted.size, 'of', productIds.length, 'rows');
  }

  // Shipping address applies to the whole order (single seller, single shipment)
  const sessionAny = session as any;
  const shippingDetails = sessionAny.shipping_details || sessionAny.collected_information?.shipping_details;
  const customerDetails = session.customer_details;
  // Shipping address ONLY — no billing fallback. A pickup order has no shipping
  // address, so shippingAddress stays null and the workorder note reads "Pickup".
  const addr = shippingDetails?.address;
  const shippingAddress = addr
    ? {
        name: shippingDetails?.name || customerDetails?.name || '',
        phone: customerDetails?.phone || '',
        line1: addr.line1 || '',
        line2: addr.line2 || '',
        city: addr.city || '',
        state: addr.state || '',
        postal_code: addr.postal_code || '',
        country: addr.country || '',
      }
    : null;

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const fundsReleaseAt = new Date();
  fundsReleaseAt.setDate(fundsReleaseAt.getDate() + 7);

  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const orderBase = `ORD-${datePart}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Live stock per product, to decide whether each purchase depletes the listing.
  // Unique listings (private_listing) are one-off; shop inventory (store_inventory)
  // stays active until the purchased qty meets stock. We never decrement qoh —
  // Lightspeed POS owns that number; a later sync reconciles counts.
  const stockById = new Map<string, { listingType: string | null; qoh: number | null; lightspeedItemId: string | null }>();
  {
    const { data: stockRows } = await supabase
      .from('products')
      .select('id, listing_type, qoh, lightspeed_item_id, listing_source')
      .in('id', productIds);
    for (const r of stockRows || []) {
      stockById.set(r.id, {
        listingType: (r as any).listing_type ?? null,
        qoh: typeof (r as any).qoh === 'number' ? (r as any).qoh : null,
        lightspeedItemId: (r as any).lightspeed_item_id ?? null,
      });
    }
  }

  let firstPurchaseId: string | null = null;
  let createdCount = 0;
  // Collect every Lightspeed line in the cart so we can create ONE consolidated
  // YELLOW JERSEY SALE workorder (all products) after the loop, not one per item.
  const lsWorkorderLines: Array<{ lightspeedItemId: string; quantity: number; unitPrice: number; purchaseId: string }> = [];

  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];
    const itemPrice = itemPrices[i];

    if (alreadyInserted.has(productId)) {
      console.log('[Stripe Webhook] Cart: skipping already-inserted product:', productId);
      continue;
    }
    if (!Number.isFinite(itemPrice)) {
      console.error('[Stripe Webhook] Cart: invalid item price, skipping product:', productId);
      continue;
    }

    const rawQty = itemQuantities[i];
    const qty = Number.isFinite(rawQty) && rawQty >= 1 ? rawQty : 1;
    const lineSubtotal = itemPrice * qty; // item_price stays the UNIT price

    const isFirst = i === 0;
    const rowShipping = isFirst ? deliveryCost : 0;
    const rowBuyerFee = isFirst ? buyerFee : 0;
    const rowVoucherDiscount = isFirst ? voucherDiscount : 0;
    // Row total is the line subtotal (unit × qty) plus the first row's
    // order-level extras. Fees and payout are computed on the line subtotal.
    const rowTotal = Math.max(0, lineSubtotal + rowShipping + rowBuyerFee - rowVoucherDiscount);
    const orderNumber = `${orderBase}-${i + 1}`;

    const purchaseData: Record<string, any> = {
      buyer_id,
      seller_id,
      product_id: productId,
      order_number: orderNumber,
      item_price: itemPrice,
      quantity: qty,
      shipping_cost: rowShipping,
      total_amount: rowTotal,
      platform_fee: calculatePlatformFee(lineSubtotal),
      seller_payout_amount: calculateSellerPayout(lineSubtotal),
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      status: 'paid',
      payment_status: 'paid',
      payment_method: 'stripe',
      payment_date: new Date().toISOString(),
      payout_status: 'pending',
      funds_status: 'held',
      funds_release_at: fundsReleaseAt.toISOString(),
    };

    if (shippingAddress) purchaseData.shipping_address = shippingAddress;
    if (customerDetails?.phone) purchaseData.buyer_phone = customerDetails.phone;
    if (customerDetails?.email) purchaseData.buyer_email = customerDetails.email;
    if (rowBuyerFee > 0) purchaseData.buyer_fee = rowBuyerFee;
    if (delivery_method && isFirst) {
      purchaseData.delivery_method = delivery_method;
      purchaseData.delivery_description = delivery_description;
    }
    if (voucher_id && isFirst) {
      purchaseData.voucher_id = voucher_id;
      purchaseData.voucher_discount = rowVoucherDiscount;
    }

    // Resilient insert: full row first, then core fields if optional columns
    // (buyer_fee/delivery_*/voucher_*/shipping_address) don't exist yet.
    let purchase: any;
    const result1 = await supabase.from('purchases').insert(purchaseData).select().single();
    if (result1.error) {
      console.log('[Stripe Webhook] Cart: full insert failed, retrying core fields:', result1.error.message);
      // Core fallback omits `quantity` (column may not exist pre-migration), but
      // total_amount and fees already reflect the line subtotal, so the money is
      // correct; only the explicit per-unit count is dropped until the migration runs.
      const coreData = {
        buyer_id,
        seller_id,
        product_id: productId,
        order_number: orderNumber,
        item_price: itemPrice,
        shipping_cost: rowShipping,
        total_amount: rowTotal,
        platform_fee: calculatePlatformFee(lineSubtotal),
        seller_payout_amount: calculateSellerPayout(lineSubtotal),
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        status: 'paid',
        payment_status: 'paid',
        payment_method: 'stripe',
        payment_date: new Date().toISOString(),
        payout_status: 'pending',
        funds_status: 'held',
        funds_release_at: fundsReleaseAt.toISOString(),
      };
      const result2 = await supabase.from('purchases').insert(coreData).select().single();
      if (result2.error) {
        console.error('[Stripe Webhook] Cart: core insert also failed for product:', productId, result2.error.message);
        continue; // Skip marking sold; leave for manual reconciliation
      }
      purchase = result2.data;
    } else {
      purchase = result1.data;
    }

    createdCount++;
    if (!firstPurchaseId) firstPurchaseId = purchase.id;
    console.log('[Stripe Webhook] Cart: ✓ purchase created:', purchase.id, orderNumber, 'product:', productId);

    // --------------------------------------------------------
    // Collect Lightspeed line (one consolidated workorder is created after the loop)
    // --------------------------------------------------------
    const lsItemId = stockById.get(productId)?.lightspeedItemId ?? null;
    if (lsItemId) {
      lsWorkorderLines.push({ lightspeedItemId: lsItemId, quantity: qty, unitPrice: itemPrice, purchaseId: purchase.id });
    }

    // Mark sold only when this purchase depletes the listing. Unique listings are
    // one-off; shop inventory sells out only when qty meets stock. qoh is left
    // untouched (POS-owned) — a later sync reconciles the real count.
    const stock = stockById.get(productId);
    const available =
      stock?.listingType === 'private_listing'
        ? 1
        : typeof stock?.qoh === 'number' && stock.qoh > 0
          ? stock.qoh
          : 1;

    if (qty >= available) {
      const { error: updateError } = await supabase
        .from('products')
        .update({
          sold_at: new Date().toISOString(),
          is_active: false,
          listing_status: 'sold',
        })
        .eq('id', productId)
        .is('sold_at', null);

      if (updateError) {
        console.error('[Stripe Webhook] Cart: failed to mark product sold:', productId, updateError.message);
      } else {
        console.log('[Stripe Webhook] Cart: product marked sold:', productId);
      }
    } else {
      console.log(
        '[Stripe Webhook] Cart: stock remains, leaving listing active:',
        productId,
        `(bought ${qty} of ${available})`
      );
    }
  }

  // One consolidated YELLOW JERSEY SALE workorder for the whole cart (single
  // seller, all Lightspeed products as line items). Stored on every LS row.
  if (lsWorkorderLines.length > 0) {
    const workorderId = await createLightspeedYellowJerseyWorkorder({
      sellerId: seller_id,
      items: lsWorkorderLines.map((l) => ({
        lightspeedItemId: l.lightspeedItemId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      orderNumber: orderBase,
      buyerName: shippingAddress?.name || customerDetails?.name || null,
      shippingAddress: formatShippingAddressLine(shippingAddress),
    });
    if (workorderId) {
      const purchaseIds = lsWorkorderLines.map((l) => l.purchaseId);
      await supabase
        .from('purchases')
        .update({ lightspeed_workorder_id: workorderId })
        .in('id', purchaseIds)
        .then(({ error }) => {
          if (error) console.warn('[Stripe Webhook] Cart: could not store lightspeed_workorder_id (pre-migration?):', error.message);
        });
    }
  }

  // Mark voucher used once for the whole order (linked to the first row)
  if (voucher_id && firstPurchaseId) {
    const { error: voucherUpdateError } = await supabase
      .from('vouchers')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_on_purchase_id: firstPurchaseId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', voucher_id)
      .eq('status', 'active'); // Idempotent — only if still active

    if (voucherUpdateError) {
      console.error('[Stripe Webhook] Cart: failed to mark voucher used:', voucherUpdateError.message);
    } else {
      console.log('[Stripe Webhook] Cart: ✓ voucher marked used:', voucher_id);
    }
  }

  // Save shipping address to buyer profile if not already set
  await maybeSaveShippingAddressToProfile(supabase, buyer_id, shippingAddress);

  console.log('[Stripe Webhook] Cart: created', createdCount, 'purchase rows. Funds held until', fundsReleaseAt.toISOString());
  console.log('[Stripe Webhook] ====== CART CHECKOUT COMPLETE SUCCESS ======');
}

// ============================================================
// Handle PaymentIntent Succeeded (Embedded Checkout)
// ============================================================

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log('[Stripe Webhook] ====== PAYMENT INTENT SUCCEEDED START ======');
  console.log('[Stripe Webhook] PaymentIntent ID:', paymentIntent.id);
  console.log('[Stripe Webhook] Amount:', paymentIntent.amount);
  console.log('[Stripe Webhook] Status:', paymentIntent.status);
  
  const supabase = getServiceClient();
  
  // Extract metadata
  const metadata = paymentIntent.metadata;
  console.log('[Stripe Webhook] Metadata:', JSON.stringify(metadata, null, 2));
  
  if (!metadata) {
    console.error('[Stripe Webhook] No metadata in payment intent - ABORTING');
    return;
  }

  const {
    product_id,
    buyer_id,
    seller_id,
    item_price,
    delivery_method,
    delivery_cost,
    delivery_description,
    buyer_fee,
    total_amount,
    platform_fee,
    seller_payout,
    voucher_id,
    voucher_discount,
  } = metadata;

  console.log('[Stripe Webhook] Extracted IDs:', { product_id, buyer_id, seller_id });
  console.log('[Stripe Webhook] Delivery:', { delivery_method, delivery_cost, delivery_description });
  
  // Log voucher info if present
  if (voucher_id) {
    console.log('[Stripe Webhook] >>> VOUCHER APPLIED <<<');
    console.log('[Stripe Webhook] Voucher ID:', voucher_id);
    console.log('[Stripe Webhook] Voucher Discount:', voucher_discount);
  }

  if (!product_id || !buyer_id || !seller_id) {
    console.error('[Stripe Webhook] Missing required metadata - ABORTING:', metadata);
    return;
  }

  // Check for idempotency - don't create duplicate purchases
  const { data: existingPurchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .single();

  if (existingPurchase) {
    console.log('[Stripe Webhook] Purchase already exists for payment intent:', paymentIntent.id);
    return;
  }

  // Verify product is still available (race condition protection).
  // Also fetch lightspeed_item_id to create a quote sale for Lightspeed products.
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, is_active, sold_at, lightspeed_item_id, listing_source')
    .eq('id', product_id)
    .single();

  if (productError || !product) {
    console.error('[Stripe Webhook] Product not found:', product_id);
  }

  if (product?.sold_at) {
    console.error('[Stripe Webhook] Product already sold:', product_id);
    // TODO: Trigger automatic refund
    return;
  }

  // Generate order number
  const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Calculate funds release date (7 days from now)
  const fundsReleaseAt = new Date();
  fundsReleaseAt.setDate(fundsReleaseAt.getDate() + 7);

  // Create purchase record with delivery information
  const purchaseData: Record<string, any> = {
    buyer_id,
    seller_id,
    product_id,
    order_number: orderNumber,
    item_price: parseFloat(item_price),
    shipping_cost: parseFloat(delivery_cost || '0'),
    total_amount: parseFloat(total_amount),
    platform_fee: parseFloat(platform_fee),
    seller_payout_amount: parseFloat(seller_payout),
    stripe_payment_intent_id: paymentIntent.id,
    status: 'paid',
    payment_status: 'paid',
    payment_method: 'stripe',
    payment_date: new Date().toISOString(),
    payout_status: 'pending',
    // Escrow fields
    funds_status: 'held',
    funds_release_at: fundsReleaseAt.toISOString(),
  };

  // Add delivery information
  if (delivery_method) {
    purchaseData.delivery_method = delivery_method;
    purchaseData.delivery_description = delivery_description;
  }
  if (buyer_fee) {
    purchaseData.buyer_fee = parseFloat(buyer_fee);
  }
  
  // Add voucher info if this purchase used a voucher
  if (voucher_id) {
    purchaseData.voucher_id = voucher_id;
    purchaseData.voucher_discount = parseFloat(voucher_discount || '0');
    console.log('[Stripe Webhook] Purchase linked to voucher:', voucher_id);
  }

  console.log('[Stripe Webhook] Inserting purchase with data:', JSON.stringify(purchaseData, null, 2));

  // Insert purchase
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert(purchaseData)
    .select()
    .single();

  if (purchaseError) {
    console.error('[Stripe Webhook] ✗ Failed to create purchase:', JSON.stringify(purchaseError, null, 2));
    
    // Try without delivery columns if they don't exist yet
    delete purchaseData.delivery_method;
    delete purchaseData.delivery_description;
    
    const { data: purchaseRetry, error: retryError } = await supabase
      .from('purchases')
      .insert(purchaseData)
      .select()
      .single();
    
    if (retryError) {
      console.error('[Stripe Webhook] ✗ Retry also failed:', retryError.message);
      throw retryError;
    }
    
    console.log('[Stripe Webhook] ✓ Purchase created (retry):', purchaseRetry.id, orderNumber);
  } else {
    console.log('[Stripe Webhook] ✓ Purchase created:', purchase.id, orderNumber);
  }

  // Get the purchase ID (from either attempt)
  const purchaseId = purchase?.id;

  // Mark product as sold
  const { error: updateError } = await supabase
    .from('products')
    .update({
      sold_at: new Date().toISOString(),
      is_active: false,
      listing_status: 'sold',
    })
    .eq('id', product_id)
    .is('sold_at', null);

  if (updateError) {
    console.error('[Stripe Webhook] Failed to mark product as sold:', updateError);
  } else {
    console.log('[Stripe Webhook] Product marked as sold:', product_id);
  }

  // ============================================================
  // Create Lightspeed YELLOW JERSEY SALE Workorder (if Lightspeed product)
  // ============================================================
  // Non-fatal: LS errors are logged but never bubble up to Stripe.
  if (product?.lightspeed_item_id) {
    const workorderId = await createLightspeedYellowJerseyWorkorder({
      sellerId: seller_id,
      items: [{ lightspeedItemId: product.lightspeed_item_id, quantity: 1, unitPrice: parseFloat(item_price) }],
      orderNumber,
    });
    if (workorderId && purchaseId) {
      await supabase
        .from('purchases')
        .update({ lightspeed_workorder_id: workorderId })
        .eq('id', purchaseId)
        .then(({ error }) => {
          if (error) console.warn('[Stripe Webhook] Could not store lightspeed_workorder_id (pre-migration?):', error.message);
        });
    }
  }

  // ============================================================
  // Handle Voucher Usage - Mark voucher as used
  // ============================================================
  if (voucher_id && purchaseId) {
    console.log('[Stripe Webhook] Marking voucher as used:', voucher_id);

    const { error: voucherUpdateError } = await supabase
      .from('vouchers')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_on_purchase_id: purchaseId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', voucher_id)
      .eq('status', 'active'); // Only update if still active (idempotency)

    if (voucherUpdateError) {
      console.error('[Stripe Webhook] Failed to mark voucher as used:', voucherUpdateError);
    } else {
      console.log('[Stripe Webhook] ✓ Voucher marked as used:', voucher_id);
    }
  }

  // Save shipping address to buyer profile if not already set
  const piShipping = paymentIntent.shipping;
  const piShippingAddress = piShipping?.address ? {
    name: piShipping.name || '',
    phone: piShipping.phone || '',
    line1: piShipping.address.line1 || '',
    line2: piShipping.address.line2 || '',
    city: piShipping.address.city || '',
    state: piShipping.address.state || '',
    postal_code: piShipping.address.postal_code || '',
    country: piShipping.address.country || '',
  } : null;
  await maybeSaveShippingAddressToProfile(supabase, buyer_id, piShippingAddress);

  // SMS notification is now handled on the success page
  // This simplifies the flow and ensures the SMS only sends after successful redirect

  console.log(`[Stripe Webhook] Delivery method: ${delivery_method}`);
  console.log(`[Stripe Webhook] Funds held until: ${fundsReleaseAt.toISOString()}`);
  console.log('[Stripe Webhook] ====== PAYMENT INTENT SUCCEEDED END ======');
}

// ============================================================
// Handle Connect Account Updated
// ============================================================

async function handleAccountUpdated(account: Stripe.Account) {
  const supabase = getServiceClient();

  console.log('[Stripe Webhook] Account updated:', account.id);

  // Determine new status
  let status = 'pending';
  if (account.details_submitted && account.payouts_enabled) {
    status = 'active';
  } else if (account.requirements?.disabled_reason) {
    status = 'restricted';
  } else if (account.details_submitted) {
    status = 'pending';
  }

  // Update user record
  const { error } = await supabase
    .from('users')
    .update({
      stripe_account_status: status,
      stripe_payouts_enabled: account.payouts_enabled || false,
      stripe_details_submitted: account.details_submitted || false,
      stripe_onboarding_complete: account.details_submitted && account.payouts_enabled,
    })
    .eq('stripe_account_id', account.id);

  if (error) {
    console.error('[Stripe Webhook] Failed to update user:', error);
  } else {
    console.log('[Stripe Webhook] User updated with status:', status);
  }
}

