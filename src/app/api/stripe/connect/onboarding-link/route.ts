// ============================================================
// Stripe Connect Onboarding Link API
// ============================================================
// POST: Generates a new onboarding link for incomplete accounts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import {
  createStripeConnectOnboardingLink,
  createStripeExpressAccount,
  isInaccessibleConnectAccountError,
  resetStoredStripeConnectAccount,
} from '@/lib/stripe/connect';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const stripe = getStripe();

    // Get base URL from request or environment
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'yellowjersey.store';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

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
      .select('stripe_account_id, email, business_name, name')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile.stripe_account_id) {
      return NextResponse.json(
        { error: 'No Stripe account found. Please create one first.' },
        { status: 400 }
      );
    }

    let accountLink;
    let accountId = profile.stripe_account_id;

    try {
      await stripe.accounts.retrieve(accountId);
      accountLink = await createStripeConnectOnboardingLink(stripe, accountId, baseUrl);
    } catch (error) {
      if (!isInaccessibleConnectAccountError(error)) {
        throw error;
      }

      console.warn('[Stripe Connect Onboarding] Stored account is inaccessible; creating a new account:', {
        userId: user.id,
        accountId,
      });
      await resetStoredStripeConnectAccount(supabase, user.id);
      const fresh = await createStripeExpressAccount({
        stripe,
        supabase,
        userId: user.id,
        userEmail: user.email,
        profile,
        baseUrl,
      });
      accountId = fresh.account.id;
      accountLink = fresh.accountLink;
    }

    return NextResponse.json({
      url: accountLink.url,
      accountId,
    });

  } catch (error) {
    console.error('[Stripe Connect Onboarding] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate onboarding link' },
      { status: 500 }
    );
  }
}
