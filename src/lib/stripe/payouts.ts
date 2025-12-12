// ============================================================
// Stripe Payout Utilities
// ============================================================
// Functions for transferring funds to connected seller accounts

import { createClient } from '@supabase/supabase-js';
import { getStripe, PLATFORM_FEE_PERCENTAGE } from '@/lib/stripe';

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
      stripe_transfer_id
    `)
    .eq('id', purchaseId)
    .single();

  if (purchaseError || !purchase) {
    throw new Error(`Purchase not found: ${purchaseId}`);
  }

  // Check if already paid out
  if (purchase.stripe_transfer_id) {
    console.log(`[Payout] Already paid out: ${purchase.stripe_transfer_id}`);
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
    console.log(`[Payout] Seller has no Stripe account, skipping payout`);
    // Record failed payout attempt
    await recordPayoutAttempt(supabase, purchase, null, 'failed', 'Seller has no Stripe account');
    return;
  }

  if (!seller.stripe_payouts_enabled) {
    console.log(`[Payout] Seller payouts not enabled, skipping`);
    await recordPayoutAttempt(supabase, purchase, seller.stripe_account_id, 'failed', 'Seller payouts not enabled');
    return;
  }

  // Calculate payout amount (should already be calculated, but verify)
  const payoutAmount = purchase.seller_payout_amount || 
    Math.round((purchase.total_amount * (1 - PLATFORM_FEE_PERCENTAGE)) * 100) / 100;

  try {
    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(payoutAmount * 100), // Convert to cents
      currency: 'aud',
      destination: seller.stripe_account_id,
      transfer_group: purchase.order_number,
      metadata: {
        purchase_id: purchase.id,
        order_number: purchase.order_number,
        platform: 'yellow_jersey',
      },
    });

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
    await recordPayoutAttempt(supabase, purchase, seller.stripe_account_id, 'failed', errorMessage);
    
    throw stripeError;
  }
}

// ============================================================
// Record Payout Attempt
// ============================================================

async function recordPayoutAttempt(
  supabase: ReturnType<typeof getServiceClient>,
  purchase: any,
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

