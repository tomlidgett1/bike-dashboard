// ============================================================
// Manual Sync Endpoint - FOR DEBUGGING
// ============================================================
// Manually creates purchase records from completed Stripe sessions
// Use this to recover purchases that weren't created by webhook

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase env vars');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  return new Stripe(secretKey, { apiVersion: '2025-11-17.clover' });
}

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    synced: [],
    skipped: [],
    errors: [],
  };

  try {
    const stripe = getStripe();
    const supabase = getServiceClient();

    // Get recent completed checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 20,
      status: 'complete',
    });

    console.log(`[Manual Sync] Found ${sessions.data.length} completed sessions`);

    for (const session of sessions.data) {
      try {
        // Skip if no metadata
        if (!session.metadata?.product_id || !session.metadata?.buyer_id || !session.metadata?.seller_id) {
          results.skipped.push({
            sessionId: session.id.substring(0, 20) + '...',
            reason: 'Missing metadata',
          });
          continue;
        }

        // Skip if payment not completed
        if (session.payment_status !== 'paid') {
          results.skipped.push({
            sessionId: session.id.substring(0, 20) + '...',
            reason: `Payment status: ${session.payment_status}`,
          });
          continue;
        }

        // Check if purchase already exists
        const { data: existing } = await supabase
          .from('purchases')
          .select('id')
          .eq('stripe_session_id', session.id)
          .single();

        if (existing) {
          results.skipped.push({
            sessionId: session.id.substring(0, 20) + '...',
            reason: 'Already synced',
            purchaseId: existing.id,
          });
          continue;
        }

        // Create purchase
        const {
          product_id,
          buyer_id,
          seller_id,
          item_price,
          shipping_cost,
          total_amount,
          platform_fee,
          seller_payout,
        } = session.metadata;

        const orderNumber = `ORD-${new Date(session.created * 1000).toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        const fundsReleaseAt = new Date(session.created * 1000);
        fundsReleaseAt.setDate(fundsReleaseAt.getDate() + 7);

        const { data: purchase, error: purchaseError } = await supabase
          .from('purchases')
          .insert({
            buyer_id,
            seller_id,
            product_id,
            order_number: orderNumber,
            item_price: parseFloat(item_price || '0'),
            shipping_cost: parseFloat(shipping_cost || '0'),
            total_amount: parseFloat(total_amount || '0'),
            platform_fee: parseFloat(platform_fee || '0'),
            seller_payout_amount: parseFloat(seller_payout || '0'),
            stripe_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === 'string' 
              ? session.payment_intent 
              : null,
            status: 'paid',
            payment_status: 'paid',
            payment_method: 'stripe',
            payment_date: new Date(session.created * 1000).toISOString(),
            payout_status: 'pending',
            funds_status: 'held',
            funds_release_at: fundsReleaseAt.toISOString(),
          })
          .select()
          .single();

        if (purchaseError) {
          results.errors.push({
            sessionId: session.id.substring(0, 20) + '...',
            error: purchaseError.message,
            code: purchaseError.code,
          });
          continue;
        }

        // Mark product as sold
        await supabase
          .from('products')
          .update({
            sold_at: new Date(session.created * 1000).toISOString(),
            is_active: false,
            listing_status: 'sold',
          })
          .eq('id', product_id)
          .is('sold_at', null);

        results.synced.push({
          sessionId: session.id.substring(0, 20) + '...',
          purchaseId: purchase.id,
          orderNumber: purchase.order_number,
          amount: `$${parseFloat(total_amount || '0').toFixed(2)}`,
        });

      } catch (err) {
        results.errors.push({
          sessionId: session.id.substring(0, 20) + '...',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    results.summary = {
      synced: results.synced.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
    };

  } catch (err) {
    results.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return NextResponse.json(results, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

