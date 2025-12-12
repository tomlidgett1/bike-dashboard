// ============================================================
// Stripe Webhook Diagnostic Endpoint
// ============================================================
// Tests all components of the webhook flow

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
    tests: {},
  };

  // Test 1: Environment Variables
  results.tests.envVars = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? `✓ Set (${process.env.STRIPE_SECRET_KEY.substring(0, 10)}...)` : '✗ MISSING',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? `✓ Set (${process.env.STRIPE_WEBHOOK_SECRET.substring(0, 15)}...)` : '✗ MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? `✓ Set (${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 15)}...)` : '✗ MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '✗ MISSING',
  };

  // Test 2: Stripe Connection
  try {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve();
    results.tests.stripeConnection = {
      status: '✓ OK',
      mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST',
    };
  } catch (err) {
    results.tests.stripeConnection = {
      status: '✗ FAILED',
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Test 3: Supabase Connection
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from('users').select('user_id').limit(1);
    results.tests.supabaseConnection = {
      status: error ? '✗ FAILED' : '✓ OK',
      error: error?.message,
    };
  } catch (err) {
    results.tests.supabaseConnection = {
      status: '✗ FAILED',
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Test 4: Purchases Table Structure
  try {
    const supabase = getServiceClient();
    
    // Try to insert a test record and immediately delete it
    const testId = `test-${Date.now()}`;
    const { error: insertError } = await supabase
      .from('purchases')
      .insert({
        buyer_id: '00000000-0000-0000-0000-000000000000',
        seller_id: '00000000-0000-0000-0000-000000000000',
        product_id: '00000000-0000-0000-0000-000000000000',
        order_number: testId,
        item_price: 0,
        shipping_cost: 0,
        total_amount: 0,
        platform_fee: 0,
        seller_payout_amount: 0,
        stripe_session_id: testId,
        status: 'test',
        payment_status: 'test',
        payment_method: 'test',
        payout_status: 'pending',
        funds_status: 'held',
        funds_release_at: new Date().toISOString(),
      });

    if (insertError) {
      results.tests.purchasesTable = {
        status: '✗ INSERT FAILED',
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      };
    } else {
      // Clean up test record
      await supabase.from('purchases').delete().eq('order_number', testId);
      results.tests.purchasesTable = {
        status: '✓ INSERT OK - Table structure is correct',
      };
    }
  } catch (err) {
    results.tests.purchasesTable = {
      status: '✗ EXCEPTION',
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Test 5: Recent Stripe Checkout Sessions with full metadata
  try {
    const stripe = getStripe();
    const sessions = await stripe.checkout.sessions.list({ limit: 3 });
    
    results.tests.recentCheckoutSessions = sessions.data.map(s => ({
      id: s.id.substring(0, 25) + '...',
      status: s.status,
      payment_status: s.payment_status,
      created: new Date(s.created * 1000).toISOString(),
      metadata: s.metadata,
      metadataValid: !!(s.metadata?.product_id && s.metadata?.buyer_id && s.metadata?.seller_id),
    }));
  } catch (err) {
    results.tests.recentCheckoutSessions = {
      status: '✗ FAILED',
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Test 6: Webhook Endpoints
  try {
    const stripe = getStripe();
    const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
    
    results.tests.webhookEndpoints = webhooks.data.map(w => ({
      id: w.id,
      url: w.url,
      status: w.status,
      hasCheckoutEvent: w.enabled_events?.includes('checkout.session.completed'),
      enabledEventsCount: w.enabled_events?.length || 0,
    }));

    // Find our endpoint
    const ourEndpoint = webhooks.data.find(w => w.url.includes('yellowjersey.store'));
    if (ourEndpoint) {
      results.tests.ourWebhook = {
        found: true,
        url: ourEndpoint.url,
        status: ourEndpoint.status,
        hasCheckoutCompleted: ourEndpoint.enabled_events?.includes('checkout.session.completed'),
        secretHint: 'Use the signing secret from THIS webhook in Vercel',
      };
    } else {
      results.tests.ourWebhook = {
        found: false,
        error: 'No webhook found for yellowjersey.store!',
      };
    }
  } catch (err) {
    results.tests.webhookEndpoints = {
      status: '✗ FAILED',
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Test 7: Check if any purchases exist
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('purchases')
      .select('id, order_number, stripe_session_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    results.tests.existingPurchases = {
      count: data?.length || 0,
      items: data?.map(p => ({
        id: p.id.substring(0, 8) + '...',
        order: p.order_number,
        hasStripeSession: !!p.stripe_session_id,
        created: p.created_at,
      })) || [],
      error: error?.message,
    };
  } catch (err) {
    results.tests.existingPurchases = {
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Test 8: Verify products exist for recent sessions
  try {
    const stripe = getStripe();
    const supabase = getServiceClient();
    const sessions = await stripe.checkout.sessions.list({ limit: 1 });
    
    if (sessions.data[0]?.metadata?.product_id) {
      const productId = sessions.data[0].metadata.product_id;
      const { data: product, error } = await supabase
        .from('products')
        .select('id, display_name, is_active, sold_at')
        .eq('id', productId)
        .single();

      results.tests.productCheck = {
        productId,
        found: !!product,
        product: product ? {
          name: product.display_name,
          isActive: product.is_active,
          isSold: !!product.sold_at,
        } : null,
        error: error?.message,
      };
    }
  } catch (err) {
    results.tests.productCheck = {
      error: err instanceof Error ? err.message : 'Unknown',
    };
  }

  // Summary
  const allPassed = 
    results.tests.stripeConnection?.status?.includes('OK') &&
    results.tests.supabaseConnection?.status?.includes('OK') &&
    results.tests.purchasesTable?.status?.includes('OK') &&
    results.tests.ourWebhook?.found;

  results.summary = {
    allTestsPassed: allPassed,
    likelyIssue: !allPassed ? 'See failed tests above' : 
      results.tests.existingPurchases?.count === 0 
        ? 'Webhook might not be receiving events - check STRIPE_WEBHOOK_SECRET matches the yellowjersey.store endpoint'
        : 'System appears healthy',
  };

  return NextResponse.json(results, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
