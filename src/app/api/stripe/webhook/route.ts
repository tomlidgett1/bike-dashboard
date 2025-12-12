// ============================================================
// Stripe Webhook Handler
// ============================================================
// Handles Stripe webhook events for payment confirmation
// Creates purchase records and marks products as sold

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';
import Stripe from 'stripe';

// Use service role client for webhook operations (bypasses RLS)
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Disable body parsing - Stripe needs the raw body for signature verification
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe Webhook] Signature verification failed:', message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  console.log('[Stripe Webhook] Received event:', event.type, event.id);

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[Stripe Webhook] Checkout session expired:', session.id);
        // No action needed - product remains available
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('[Stripe Webhook] Payment failed:', paymentIntent.id);
        // Could notify user or log for analytics
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
  const supabase = getServiceClient();

  console.log('[Stripe Webhook] Processing checkout complete:', session.id);

  // Extract metadata
  const metadata = session.metadata;
  if (!metadata) {
    console.error('[Stripe Webhook] No metadata in session');
    return;
  }

  const {
    product_id,
    buyer_id,
    seller_id,
    item_price,
    shipping_cost,
    total_amount,
    platform_fee,
    seller_payout,
  } = metadata;

  if (!product_id || !buyer_id || !seller_id) {
    console.error('[Stripe Webhook] Missing required metadata:', metadata);
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

  // Verify product is still available (race condition protection)
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, is_active, sold_at')
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

  // Create purchase record with escrow fields
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
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
    })
    .select()
    .single();

  if (purchaseError) {
    console.error('[Stripe Webhook] Failed to create purchase:', purchaseError);
    throw purchaseError;
  }

  console.log('[Stripe Webhook] Purchase created:', purchase.id, orderNumber);

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

  // TODO: Send confirmation emails to buyer and seller
  // TODO: Create notification for seller

  console.log(`[Stripe Webhook] Funds held until: ${fundsReleaseAt.toISOString()}`);
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
