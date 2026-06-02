// ============================================================
// Stripe Webhook Diagnostic Endpoint
// ============================================================
// Tests all components of the webhook flow

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requireAdminAccess } from '@/lib/admin-auth';
import Stripe from 'stripe';

type DiagnosticResults = {
  timestamp: string;
  tests: Record<string, unknown>;
  summary?: unknown;
};

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

export async function GET() {
  const results: DiagnosticResults = {
    timestamp: new Date().toISOString(),
    tests: {},
  };

  const authClient = await createServerClient();
  const auth = await requireAdminAccess(authClient);
  if (!auth.authorized) {
    return auth.response;
  }

  // Test 1: Environment Variables
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
  results.tests.envVars = {
    STRIPE_SECRET_KEY: stripeSecretKey
      ? `✓ Set (${stripeSecretKey.startsWith('sk_live') ? 'LIVE' : 'TEST'})`
      : '✗ MISSING',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? '✓ Set' : '✗ MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ MISSING',
  };

  // Test 2: Stripe Connection
  try {
    const stripe = getStripe();
    await stripe.balance.retrieve();
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

    const { error: selectError } = await supabase
      .from('purchases')
      .select('id, stripe_session_id, funds_status, funds_release_at')
      .limit(1);

    if (selectError) {
      results.tests.purchasesTable = {
        status: '✗ SELECT FAILED',
        error: selectError.message,
        code: selectError.code,
        details: selectError.details,
        hint: selectError.hint,
      };
    } else {
      results.tests.purchasesTable = {
        status: '✓ SELECT OK - Required columns are readable',
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
      livemode: s.livemode,
      created: new Date(s.created * 1000).toISOString(),
      metadataKeys: s.metadata ? Object.keys(s.metadata) : [],
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
  const tests = results.tests as {
    stripeConnection?: { status?: string };
    supabaseConnection?: { status?: string };
    purchasesTable?: { status?: string };
    ourWebhook?: { found?: boolean };
    existingPurchases?: { count?: number };
  };
  const allPassed = 
    tests.stripeConnection?.status?.includes('OK') &&
    tests.supabaseConnection?.status?.includes('OK') &&
    tests.purchasesTable?.status?.includes('OK') &&
    tests.ourWebhook?.found;

  results.summary = {
    allTestsPassed: allPassed,
    likelyIssue: !allPassed ? 'See failed tests above' : 
      tests.existingPurchases?.count === 0 
        ? 'Webhook might not be receiving events - check STRIPE_WEBHOOK_SECRET matches the yellowjersey.store endpoint'
        : 'System appears healthy',
  };

  return NextResponse.json(results, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
