// ============================================================
// Stripe Connect Onboarding Link API
// ============================================================
// POST: Generates a new onboarding link for incomplete accounts

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
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile.stripe_account_id) {
      return NextResponse.json(
        { error: 'No Stripe account found. Please create one first.' },
        { status: 400 }
      );
    }

    // Generate new onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/marketplace/settings?stripe=refresh`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/marketplace/settings?stripe=success`,
      type: 'account_onboarding',
    });

    return NextResponse.json({
      url: accountLink.url,
    });

  } catch (error) {
    console.error('[Stripe Connect Onboarding] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate onboarding link' },
      { status: 500 }
    );
  }
}
