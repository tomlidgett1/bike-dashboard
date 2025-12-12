// ============================================================
// Stripe Connect Status API
// ============================================================
// GET: Returns the seller's Stripe Connect account status

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

export async function GET(request: NextRequest) {
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

    // Get user profile with Stripe info
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select(`
        stripe_account_id,
        stripe_account_status,
        stripe_onboarding_complete,
        stripe_payouts_enabled,
        stripe_details_submitted,
        stripe_connected_at
      `)
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('[Stripe Connect Status] Profile fetch error:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      );
    }

    // If no Stripe account, return not connected
    if (!profile.stripe_account_id) {
      return NextResponse.json({
        connected: false,
        status: 'not_connected',
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboardingComplete: false,
      });
    }

    // Fetch latest status from Stripe
    try {
      const account = await stripe.accounts.retrieve(profile.stripe_account_id);

      // Determine status
      let status = 'pending';
      if (account.details_submitted && account.payouts_enabled) {
        status = 'active';
      } else if (account.requirements?.disabled_reason) {
        status = 'restricted';
      } else if (account.details_submitted) {
        status = 'pending';
      }

      // Update local database if status changed
      if (
        status !== profile.stripe_account_status ||
        account.payouts_enabled !== profile.stripe_payouts_enabled ||
        account.details_submitted !== profile.stripe_details_submitted
      ) {
        await supabase
          .from('users')
          .update({
            stripe_account_status: status,
            stripe_payouts_enabled: account.payouts_enabled || false,
            stripe_details_submitted: account.details_submitted || false,
            stripe_onboarding_complete: account.details_submitted && account.payouts_enabled,
          })
          .eq('user_id', user.id);
      }

      return NextResponse.json({
        connected: true,
        accountId: profile.stripe_account_id,
        status,
        payoutsEnabled: account.payouts_enabled || false,
        detailsSubmitted: account.details_submitted || false,
        onboardingComplete: account.details_submitted && account.payouts_enabled,
        chargesEnabled: account.charges_enabled || false,
        requirements: account.requirements?.currently_due || [],
        connectedAt: profile.stripe_connected_at,
      });

    } catch (stripeError) {
      console.error('[Stripe Connect Status] Stripe API error:', stripeError);
      
      // Return cached status if Stripe API fails
      return NextResponse.json({
        connected: true,
        accountId: profile.stripe_account_id,
        status: profile.stripe_account_status,
        payoutsEnabled: profile.stripe_payouts_enabled,
        detailsSubmitted: profile.stripe_details_submitted,
        onboardingComplete: profile.stripe_onboarding_complete,
        connectedAt: profile.stripe_connected_at,
        cached: true,
      });
    }

  } catch (error) {
    console.error('[Stripe Connect Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
