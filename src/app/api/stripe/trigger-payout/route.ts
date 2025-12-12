// ============================================================
// Manual Payout Trigger (for testing/debugging)
// ============================================================
// POST: Manually trigger payout for a purchase

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(`${new Date().toISOString()} - ${msg}`);
  };

  try {
    const { purchaseId } = await request.json();
    
    if (!purchaseId) {
      return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });
    }

    log(`Starting payout for purchase: ${purchaseId}`);

    // Check env vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: 'Missing Supabase env vars',
        logs 
      }, { status: 500 });
    }

    if (!stripeSecretKey) {
      return NextResponse.json({ 
        error: 'Missing STRIPE_SECRET_KEY',
        logs 
      }, { status: 500 });
    }

    log('Environment variables OK');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey);

    // Fetch purchase
    log('Fetching purchase...');
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('*')
      .eq('id', purchaseId)
      .single();

    if (purchaseError) {
      return NextResponse.json({ 
        error: 'Purchase fetch error',
        details: purchaseError.message,
        logs 
      }, { status: 500 });
    }

    if (!purchase) {
      return NextResponse.json({ 
        error: 'Purchase not found',
        logs 
      }, { status: 404 });
    }

    log(`Purchase found: ${purchase.order_number}`);
    log(`  - funds_status: ${purchase.funds_status}`);
    log(`  - total_amount: $${purchase.total_amount}`);
    log(`  - seller_payout_amount: $${purchase.seller_payout_amount}`);
    log(`  - stripe_transfer_id: ${purchase.stripe_transfer_id || 'none'}`);

    // Check if already paid
    if (purchase.stripe_transfer_id) {
      return NextResponse.json({ 
        error: 'Already paid out',
        transfer_id: purchase.stripe_transfer_id,
        logs 
      }, { status: 400 });
    }

    // Check funds status
    if (!['released', 'auto_released'].includes(purchase.funds_status)) {
      return NextResponse.json({ 
        error: `Cannot payout - funds_status is: ${purchase.funds_status}`,
        logs 
      }, { status: 400 });
    }

    log('Funds status OK - released');

    // Fetch seller
    log(`Fetching seller: ${purchase.seller_id}`);
    const { data: seller, error: sellerError } = await supabase
      .from('users')
      .select('user_id, name, stripe_account_id, stripe_payouts_enabled, stripe_account_status')
      .eq('user_id', purchase.seller_id)
      .single();

    if (sellerError) {
      return NextResponse.json({ 
        error: 'Seller fetch error',
        details: sellerError.message,
        logs 
      }, { status: 500 });
    }

    if (!seller) {
      return NextResponse.json({ 
        error: 'Seller not found',
        logs 
      }, { status: 404 });
    }

    log(`Seller found: ${seller.name}`);
    log(`  - stripe_account_id: ${seller.stripe_account_id || 'NONE'}`);
    log(`  - stripe_payouts_enabled: ${seller.stripe_payouts_enabled}`);
    log(`  - stripe_account_status: ${seller.stripe_account_status}`);

    if (!seller.stripe_account_id) {
      return NextResponse.json({ 
        error: 'Seller has no Stripe account',
        logs 
      }, { status: 400 });
    }

    // Calculate payout amount
    const PLATFORM_FEE_PERCENTAGE = 0.03;
    const payoutAmount = purchase.seller_payout_amount || 
      Math.round((purchase.total_amount * (1 - PLATFORM_FEE_PERCENTAGE)) * 100) / 100;

    log(`Payout amount: $${payoutAmount} (${Math.round(payoutAmount * 100)} cents)`);

    // Check platform balance first
    log('Checking platform balance...');
    try {
      const balance = await stripe.balance.retrieve();
      const audBalance = balance.available.find(b => b.currency === 'aud');
      log(`Platform AUD balance: ${audBalance ? audBalance.amount / 100 : 0}`);
    } catch (balanceError) {
      log(`Balance check failed: ${balanceError instanceof Error ? balanceError.message : 'unknown'}`);
    }

    // Create transfer
    log(`Creating transfer to ${seller.stripe_account_id}...`);
    
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(payoutAmount * 100),
        currency: 'aud',
        destination: seller.stripe_account_id,
        transfer_group: purchase.order_number,
        metadata: {
          purchase_id: purchase.id,
          order_number: purchase.order_number,
          platform: 'yellow_jersey',
        },
      });

      log(`✅ Transfer created successfully: ${transfer.id}`);

      // Update purchase
      const { error: updateError } = await supabase
        .from('purchases')
        .update({
          stripe_transfer_id: transfer.id,
          payout_triggered_at: new Date().toISOString(),
          payout_status: 'completed',
        })
        .eq('id', purchaseId);

      if (updateError) {
        log(`Warning: Purchase update failed: ${updateError.message}`);
      } else {
        log('Purchase updated with transfer ID');
      }

      // Record payout
      const platformFee = purchase.platform_fee || 
        Math.round(purchase.total_amount * PLATFORM_FEE_PERCENTAGE * 100) / 100;

      const { error: payoutError } = await supabase
        .from('seller_payouts')
        .insert({
          seller_id: purchase.seller_id,
          purchase_id: purchase.id,
          stripe_transfer_id: transfer.id,
          stripe_account_id: seller.stripe_account_id,
          gross_amount: purchase.total_amount,
          platform_fee: platformFee,
          net_amount: payoutAmount,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });

      if (payoutError) {
        log(`Warning: Payout record failed: ${payoutError.message}`);
      } else {
        log('Payout recorded in seller_payouts');
      }

      return NextResponse.json({
        success: true,
        transfer_id: transfer.id,
        amount: payoutAmount,
        logs,
      });

    } catch (stripeError: any) {
      log(`❌ Stripe transfer failed: ${stripeError.message}`);
      log(`   Type: ${stripeError.type}`);
      log(`   Code: ${stripeError.code}`);
      
      return NextResponse.json({
        error: 'Stripe transfer failed',
        stripe_error: {
          message: stripeError.message,
          type: stripeError.type,
          code: stripeError.code,
        },
        logs,
      }, { status: 500 });
    }

  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json({ 
      error: 'Internal error',
      details: error instanceof Error ? error.message : 'Unknown',
      logs 
    }, { status: 500 });
  }
}
