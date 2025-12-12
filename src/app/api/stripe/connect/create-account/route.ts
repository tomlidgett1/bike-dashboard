// ============================================================
// Create Stripe Connect Account API
// ============================================================
// POST: Creates a Stripe Connect Express account for the seller
// and returns the onboarding URL

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const stripe = getStripe();

    // Get base URL from request or environment
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'yellowjersey.store';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

    console.log('[Stripe Connect] Using base URL:', baseUrl);

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

    if (profileError) {
      console.error('[Stripe Connect] Profile fetch error:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      );
    }

    // Check if already has a Stripe account
    if (profile.stripe_account_id) {
      // Generate new onboarding link for existing account
      const accountLink = await stripe.accountLinks.create({
        account: profile.stripe_account_id,
        refresh_url: `${baseUrl}/marketplace/settings?stripe=refresh`,
        return_url: `${baseUrl}/marketplace/settings?stripe=success`,
        type: 'account_onboarding',
      });

      return NextResponse.json({
        url: accountLink.url,
        accountId: profile.stripe_account_id,
        isExisting: true,
      });
    }

    // Create new Stripe Connect Express account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'AU',
      email: profile.email || user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual', // Can be updated during onboarding
      business_profile: {
        name: profile.business_name || profile.name || undefined,
        product_description: 'Selling cycling products on Yellow Jersey Marketplace',
      },
      metadata: {
        user_id: user.id,
        platform: 'yellow_jersey',
      },
    });

    // Save account ID to user profile
    const { error: updateError } = await supabase
      .from('users')
      .update({
        stripe_account_id: account.id,
        stripe_account_status: 'pending',
        stripe_connected_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[Stripe Connect] Failed to save account ID:', updateError);
      // Don't fail - account is created, just log the error
    }

    // Generate onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${baseUrl}/marketplace/settings?stripe=refresh`,
      return_url: `${baseUrl}/marketplace/settings?stripe=success`,
      type: 'account_onboarding',
    });

    console.log('[Stripe Connect] Account created:', account.id);

    return NextResponse.json({
      url: accountLink.url,
      accountId: account.id,
      isExisting: false,
    });

  } catch (error) {
    console.error('[Stripe Connect] Error creating account:', error);
    return NextResponse.json(
      { error: 'Failed to create Stripe account' },
      { status: 500 }
    );
  }
}
