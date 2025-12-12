// ============================================================
// Stripe Debug Endpoint
// ============================================================
// GET: Checks Stripe configuration and recent events

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    const stripe = getStripe();

    // Test 1: Stripe API connection
    try {
      const balance = await stripe.balance.retrieve();
      results.stripeConnection = {
        status: 'OK',
        currency: balance.available[0]?.currency || 'unknown',
      };
    } catch (err) {
      results.stripeConnection = {
        status: 'ERROR',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Test 2: Check recent checkout sessions
    try {
      const sessions = await stripe.checkout.sessions.list({
        limit: 5,
      });
      
      results.recentSessions = {
        count: sessions.data.length,
        sessions: sessions.data.map(s => ({
          id: s.id.substring(0, 20) + '...',
          status: s.status,
          paymentStatus: s.payment_status,
          created: new Date(s.created * 1000).toISOString(),
          hasMetadata: !!s.metadata && Object.keys(s.metadata).length > 0,
          metadataKeys: s.metadata ? Object.keys(s.metadata) : [],
          amountTotal: s.amount_total ? `$${(s.amount_total / 100).toFixed(2)}` : 'N/A',
        })),
      };
    } catch (err) {
      results.recentSessions = {
        status: 'ERROR',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Test 3: Check webhook endpoints configured
    try {
      const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
      
      results.webhookEndpoints = {
        count: webhooks.data.length,
        endpoints: webhooks.data.map(w => ({
          id: w.id.substring(0, 15) + '...',
          url: w.url,
          status: w.status,
          enabledEvents: w.enabled_events?.slice(0, 5),
          moreEvents: w.enabled_events && w.enabled_events.length > 5 
            ? `+${w.enabled_events.length - 5} more` 
            : null,
        })),
      };

      // Check if our endpoint is configured
      const ourEndpoint = webhooks.data.find(w => 
        w.url.includes('yellowjersey.store') || 
        w.url.includes('api/stripe/webhook')
      );

      results.productionWebhook = ourEndpoint ? {
        configured: true,
        url: ourEndpoint.url,
        status: ourEndpoint.status,
        events: ourEndpoint.enabled_events,
      } : {
        configured: false,
        message: 'No webhook found for yellowjersey.store - YOU NEED TO ADD THIS IN STRIPE DASHBOARD',
      };

    } catch (err) {
      results.webhookEndpoints = {
        status: 'ERROR',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Test 4: Check recent events
    try {
      const events = await stripe.events.list({
        limit: 10,
        types: ['checkout.session.completed'],
      });
      
      results.recentCheckoutEvents = {
        count: events.data.length,
        events: events.data.map(e => ({
          id: e.id.substring(0, 20) + '...',
          type: e.type,
          created: new Date(e.created * 1000).toISOString(),
          pending_webhooks: e.pending_webhooks,
          livemode: e.livemode,
        })),
      };
    } catch (err) {
      results.recentCheckoutEvents = {
        status: 'ERROR',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

  } catch (err) {
    results.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return NextResponse.json(results, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
