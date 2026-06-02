// ============================================================
// Create Stripe Connect Account API
// ============================================================
// POST: Creates a Stripe Connect Express account for the seller
// and returns the onboarding URL

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
    console.log('[Stripe Connect] Create account request received');
    
    const supabase = await createClient();
    const stripe = getStripe();

    // Get base URL from request or environment
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'yellowjersey.store';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

    console.log('[Stripe Connect] Using base URL:', baseUrl);
    console.log('[Stripe Connect] Headers:', { protocol, host });

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Stripe Connect] Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    console.log('[Stripe Connect] User authenticated:', user.id);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('stripe_account_id, email, business_name, name')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('[Stripe Connect] Profile fetch error:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      );
    }

    // Check if already has a Stripe account
    if (profile.stripe_account_id) {
      try {
        await stripe.accounts.retrieve(profile.stripe_account_id);
        const accountLink = await createStripeConnectOnboardingLink(
          stripe,
          profile.stripe_account_id,
          baseUrl
        );

        return NextResponse.json({
          url: accountLink.url,
          accountId: profile.stripe_account_id,
          isExisting: true,
        });
      } catch (error) {
        if (!isInaccessibleConnectAccountError(error)) {
          throw error;
        }

        console.warn('[Stripe Connect] Resetting inaccessible stored account before creating a new one:', {
          userId: user.id,
          accountId: profile.stripe_account_id,
        });
        await resetStoredStripeConnectAccount(supabase, user.id);
      }
    }

    const { account, accountLink } = await createStripeExpressAccount({
      stripe,
      supabase,
      userId: user.id,
      userEmail: user.email,
      profile,
      baseUrl,
    });

    console.log('[Stripe Connect] Account created:', account.id);

    return NextResponse.json({
      url: accountLink.url,
      accountId: account.id,
      isExisting: false,
    });

  } catch (error) {
    console.error('[Stripe Connect] Error creating account:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stripe Connect] Error details:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      error
    });
    return NextResponse.json(
      { error: 'Failed to create Stripe account', details: errorMessage },
      { status: 500 }
    );
  }
}
