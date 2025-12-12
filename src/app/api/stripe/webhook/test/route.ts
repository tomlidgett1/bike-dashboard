// ============================================================
// Webhook Test Endpoint - FOR DEBUGGING ONLY
// ============================================================
// GET: Tests the database connection and purchase creation logic

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    tests: {},
  };

  // Test 1: Environment variables
  results.tests = {
    env: {
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET ? '✓' : '✗',
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗',
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗',
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY ? '✓' : '✗',
    },
  };

  // Test 2: Supabase connection
  try {
    const supabase = getServiceClient();
    
    // Test read from purchases table
    const { data: purchaseCount, error: countError } = await supabase
      .from('purchases')
      .select('id', { count: 'exact', head: true });
    
    if (countError) {
      (results.tests as Record<string, unknown>).supabase = {
        status: 'ERROR',
        error: countError.message,
        code: countError.code,
      };
    } else {
      (results.tests as Record<string, unknown>).supabase = {
        status: 'OK',
        message: 'Connected successfully',
      };
    }

    // Test read from products table
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, display_name, sold_at, is_active')
      .limit(3);
    
    (results.tests as Record<string, unknown>).products = {
      status: productsError ? 'ERROR' : 'OK',
      count: products?.length || 0,
      sample: products?.map(p => ({ 
        id: p.id.substring(0, 8) + '...', 
        name: p.display_name?.substring(0, 20),
        sold: !!p.sold_at,
        active: p.is_active,
      })),
      error: productsError?.message,
    };

    // Test columns exist on purchases
    const { data: purchaseCols, error: colsError } = await supabase
      .from('purchases')
      .select('stripe_session_id, funds_status, funds_release_at')
      .limit(1);
    
    (results.tests as Record<string, unknown>).purchaseColumns = {
      status: colsError ? 'ERROR - columns may not exist' : 'OK',
      error: colsError?.message,
    };

    // Check seller_payouts table exists
    const { error: payoutsError } = await supabase
      .from('seller_payouts')
      .select('id')
      .limit(1);
    
    (results.tests as Record<string, unknown>).sellerPayoutsTable = {
      status: payoutsError ? 'ERROR' : 'OK',
      error: payoutsError?.message,
    };

  } catch (err) {
    (results.tests as Record<string, unknown>).supabase = {
      status: 'EXCEPTION',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // Test 3: Check recent Stripe sessions (if any purchases exist)
  try {
    const supabase = getServiceClient();
    const { data: recentPurchases } = await supabase
      .from('purchases')
      .select('id, order_number, stripe_session_id, created_at, status, funds_status')
      .order('created_at', { ascending: false })
      .limit(5);
    
    (results.tests as Record<string, unknown>).recentPurchases = {
      count: recentPurchases?.length || 0,
      items: recentPurchases?.map(p => ({
        id: p.id.substring(0, 8) + '...',
        order: p.order_number,
        hasStripeSession: !!p.stripe_session_id,
        status: p.status,
        fundsStatus: p.funds_status,
        created: p.created_at,
      })),
    };
  } catch (err) {
    (results.tests as Record<string, unknown>).recentPurchases = {
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  return NextResponse.json(results, { 
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
