// ============================================================
// Stripe Payout Utilities
// ============================================================
// Functions for transferring funds to connected seller accounts

import { createClient } from '@supabase/supabase-js';
import { getStripe, PLATFORM_FEE_PERCENTAGE } from '@/lib/stripe';
import type Stripe from 'stripe';

// Use service role client for payout operations
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================
// Trigger Seller Payout
// ============================================================

interface PayoutPurchase {
  id: string;
  seller_id: string;
  order_number: string;
  total_amount: number;
  platform_fee: number | null;
  seller_payout_amount: number | null;
  funds_status: string;
  stripe_transfer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
}

export async function triggerSellerPayout(purchaseId: string): Promise<void> {
  const supabase = getServiceClient();
  const stripe = getStripe();

  console.log(`[Payout] Processing payout for purchase: ${purchaseId}`);

  // Fetch purchase details
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .select(`
      id,
      seller_id,
      order_number,
      total_amount,
      platform_fee,
      seller_payout_amount,
      funds_status,
      stripe_transfer_id,
      stripe_payment_intent_id,
      stripe_session_id
    `)
    .eq('id', purchaseId)
    .single();

  if (purchaseError || !purchase) {
    throw new Error(`Purchase not found: ${purchaseId}`);
  }

  // Check if already paid out
  if (purchase.stripe_transfer_id) {
    console.log(`[Payout] Already paid out: ${purchase.stripe_transfer_id}`);
    await supabase
      .from('purchases')
      .update({ payout_status: 'completed' })
      .eq('id', purchaseId);
    return;
  }

  // Check funds status
  if (!['released', 'auto_released'].includes(purchase.funds_status)) {
    throw new Error(`Cannot payout - funds status is: ${purchase.funds_status}`);
  }

  // Get seller's Stripe account
  const { data: seller, error: sellerError } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_payouts_enabled')
    .eq('user_id', purchase.seller_id)
    .single();

  if (sellerError || !seller) {
    throw new Error(`Seller not found: ${purchase.seller_id}`);
  }

  if (!seller.stripe_account_id) {
    const failureReason = 'Seller has no Stripe account';
    console.log(`[Payout] ${failureReason}`);
    await markPurchasePayoutFailed(supabase, purchase.id);
    await recordPayoutAttempt(supabase, purchase, null, 'failed', failureReason);
    throw new Error(failureReason);
  }

  if (!seller.stripe_payouts_enabled) {
    const failureReason = 'Seller payouts not enabled';
    console.log(`[Payout] ${failureReason}`);
    await markPurchasePayoutFailed(supabase, purchase.id);
    await recordPayoutAttempt(supabase, purchase, seller.stripe_account_id, 'failed', failureReason);
    throw new Error(failureReason);
  }

  // Calculate payout amount (should already be calculated, but verify)
  const typedPurchase = purchase as PayoutPurchase;
  const payoutAmount = typedPurchase.seller_payout_amount || 
    Math.round((purchase.total_amount * (1 - PLATFORM_FEE_PERCENTAGE)) * 100) / 100;

  if (payoutAmount <= 0) {
    const failureReason = `Invalid payout amount: ${payoutAmount}`;
    await markPurchasePayoutFailed(supabase, purchase.id);
    await recordPayoutAttempt(supabase, purchase, seller.stripe_account_id, 'failed', failureReason);
    throw new Error(failureReason);
  }

  try {
    await supabase
      .from('purchases')
      .update({ payout_status: 'processing' })
      .eq('id', purchaseId)
      .is('stripe_transfer_id', null);

    const sourceCharge = await resolveSourceCharge(stripe, typedPurchase);
    const transferParams: Stripe.TransferCreateParams = {
      amount: Math.round(payoutAmount * 100),
      currency: 'aud',
      destination: seller.stripe_account_id,
      transfer_group: sourceCharge?.transferGroup || typedPurchase.order_number,
      metadata: {
        purchase_id: typedPurchase.id,
        order_number: typedPurchase.order_number,
        platform: 'yellow_jersey',
        ...(typedPurchase.stripe_session_id && { stripe_session_id: typedPurchase.stripe_session_id }),
        ...(typedPurchase.stripe_payment_intent_id && { stripe_payment_intent_id: typedPurchase.stripe_payment_intent_id }),
      },
    };

    if (sourceCharge?.chargeId) {
      transferParams.source_transaction = sourceCharge.chargeId;
    }

    // Create transfer to connected account
    const transfer = await stripe.transfers.create(transferParams);

    console.log(`[Payout] Transfer created: ${transfer.id}`);

    // Update purchase with transfer ID
    await supabase
      .from('purchases')
      .update({
        stripe_transfer_id: transfer.id,
        payout_triggered_at: new Date().toISOString(),
        payout_status: 'completed',
      })
      .eq('id', purchaseId);

    // Record successful payout
    await recordPayoutAttempt(
      supabase, 
      purchase, 
      seller.stripe_account_id, 
      'completed',
      null,
      transfer.id
    );

  } catch (stripeError) {
    console.error(`[Payout] Stripe transfer failed:`, stripeError);
    
    const errorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown error';
    
    // Record failed payout
    await markPurchasePayoutFailed(supabase, purchase.id);
    await recordPayoutAttempt(supabase, purchase, seller.stripe_account_id, 'failed', errorMessage);
    
    throw stripeError;
  }
}

async function markPurchasePayoutFailed(
  supabase: ReturnType<typeof getServiceClient>,
  purchaseId: string
): Promise<void> {
  await supabase
    .from('purchases')
    .update({ payout_status: 'failed' })
    .eq('id', purchaseId)
    .is('stripe_transfer_id', null);
}

async function resolveSourceCharge(
  stripe: Stripe,
  purchase: PayoutPurchase
): Promise<{ chargeId: string; transferGroup?: string | null } | null> {
  let chargeId: string | null = null;

  if (purchase.stripe_payment_intent_id) {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      purchase.stripe_payment_intent_id,
      { expand: ['latest_charge'] }
    );
    chargeId =
      typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id || null;
  }

  if (!chargeId && purchase.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(purchase.stripe_session_id, {
      expand: ['payment_intent'],
    });
    const paymentIntent = session.payment_intent;
    if (paymentIntent && typeof paymentIntent !== 'string') {
      const latestCharge = paymentIntent.latest_charge;
      chargeId = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id || null;
    }
  }

  if (!chargeId) return null;

  const charge = await stripe.charges.retrieve(chargeId);
  return {
    chargeId,
    transferGroup: charge.transfer_group,
  };
}

// ============================================================
// Record Payout Attempt
// ============================================================

async function recordPayoutAttempt(
  supabase: ReturnType<typeof getServiceClient>,
  purchase: Pick<PayoutPurchase, 'id' | 'seller_id' | 'total_amount' | 'platform_fee' | 'seller_payout_amount'>,
  stripeAccountId: string | null,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  failureReason: string | null,
  transferId?: string
): Promise<void> {
  const platformFee = purchase.platform_fee || 
    Math.round(purchase.total_amount * PLATFORM_FEE_PERCENTAGE * 100) / 100;
  
  const netAmount = purchase.seller_payout_amount || 
    Math.round((purchase.total_amount - platformFee) * 100) / 100;

  await supabase
    .from('seller_payouts')
    .insert({
      seller_id: purchase.seller_id,
      purchase_id: purchase.id,
      stripe_transfer_id: transferId || null,
      stripe_account_id: stripeAccountId || '',
      gross_amount: purchase.total_amount,
      platform_fee: platformFee,
      net_amount: netAmount,
      status,
      failure_reason: failureReason,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    });
}
