// ============================================================
// Stripe Connect Status API
// ============================================================
// GET: Returns the seller's Stripe Connect account status

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

export async function GET(request: NextRequest) {
  try {
    console.log('[Stripe Connect Status] Request received');
    
    const supabase = await createClient();
    const stripe = getStripe();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Stripe Connect Status] Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    console.log('[Stripe Connect Status] User authenticated:', user.id);

    // Get user profile with Stripe info
    // Try to fetch Stripe columns - they may not exist if migration hasn't run
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('[Stripe Connect Status] Profile fetch error:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      );
    }

    // Try to fetch Stripe-specific columns (may not exist yet)
    let stripeProfile: {
      stripe_account_id?: string | null;
      stripe_account_status?: string | null;
      stripe_onboarding_complete?: boolean | null;
      stripe_payouts_enabled?: boolean | null;
      stripe_details_submitted?: boolean | null;
      stripe_connected_at?: string | null;
    } = {};

    const { data: stripeData, error: stripeColumnsError } = await supabase
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
    
    if (stripeColumnsError) {
      // Columns likely don't exist yet - migration not run
      // Return not connected state gracefully
      console.log('[Stripe Connect Status] Stripe columns not found - migration may not have run:', stripeColumnsError.message);
      return NextResponse.json({
        connected: false,
        status: 'not_connected',
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboardingComplete: false,
        migrationRequired: true,
      });
    }
    
    if (stripeData) {
      stripeProfile = stripeData;
    }

    // If no Stripe account, return not connected
    if (!stripeProfile.stripe_account_id) {
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
      const account = await stripe.accounts.retrieve(stripeProfile.stripe_account_id);

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
        status !== stripeProfile.stripe_account_status ||
        account.payouts_enabled !== stripeProfile.stripe_payouts_enabled ||
        account.details_submitted !== stripeProfile.stripe_details_submitted
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
        accountId: stripeProfile.stripe_account_id,
        status,
        payoutsEnabled: account.payouts_enabled || false,
        detailsSubmitted: account.details_submitted || false,
        onboardingComplete: account.details_submitted && account.payouts_enabled,
        chargesEnabled: account.charges_enabled || false,
        requirements: account.requirements?.currently_due || [],
        connectedAt: stripeProfile.stripe_connected_at,
      });

    } catch (stripeError) {
      console.error('[Stripe Connect Status] Stripe API error:', stripeError);
      
      // Return cached status if Stripe API fails
      return NextResponse.json({
        connected: true,
        accountId: stripeProfile.stripe_account_id,
        status: stripeProfile.stripe_account_status || 'pending',
        payoutsEnabled: stripeProfile.stripe_payouts_enabled || false,
        detailsSubmitted: stripeProfile.stripe_details_submitted || false,
        onboardingComplete: stripeProfile.stripe_onboarding_complete || false,
        connectedAt: stripeProfile.stripe_connected_at,
        cached: true,
      });
    }

  } catch (error) {
    console.error('[Stripe Connect Status] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stripe Connect Status] Error details:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to fetch status', details: errorMessage },
      { status: 500 }
    );
  }
}
