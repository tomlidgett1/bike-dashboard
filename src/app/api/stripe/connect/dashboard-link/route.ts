// ============================================================
// Stripe Connect Dashboard Link API
// ============================================================
// POST: Generates a link to the Stripe Express Dashboard

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const stripe = getStripe();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile.stripe_account_id) {
      return NextResponse.json(
        { error: 'No Stripe account found' },
        { status: 400 }
      );
    }

    // Generate login link to Stripe Express Dashboard
    const loginLink = await stripe.accounts.createLoginLink(
      profile.stripe_account_id
    );

    return NextResponse.json({
      url: loginLink.url,
    });

  } catch (error) {
    console.error('[Stripe Connect Dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate dashboard link' },
      { status: 500 }
    );
  }
}
