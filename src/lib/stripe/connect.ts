import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CreateExpressAccountArgs {
  stripe: Stripe;
  supabase: SupabaseClient;
  userId: string;
  userEmail?: string | null;
  profile: {
    email?: string | null;
    business_name?: string | null;
    name?: string | null;
  };
  baseUrl: string;
}

export function isInaccessibleConnectAccountError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const stripeError = error as {
    code?: unknown;
    message?: unknown;
    raw?: { code?: unknown; message?: unknown };
  };
  const code = typeof stripeError.code === 'string' ? stripeError.code : stripeError.raw?.code;
  const message =
    typeof stripeError.message === 'string'
      ? stripeError.message
      : typeof stripeError.raw?.message === 'string'
        ? stripeError.raw.message
        : '';

  return (
    code === 'account_invalid' ||
    /not connected to your platform/i.test(message) ||
    /does not have access to account/i.test(message) ||
    /does not exist/i.test(message) ||
    /No such account/i.test(message)
  );
}

export async function resetStoredStripeConnectAccount(
  supabase: SupabaseClient,
  userId: string
) {
  const { error } = await supabase
    .from('users')
    .update({
      stripe_account_id: null,
      stripe_account_status: 'not_connected',
      stripe_onboarding_complete: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_connected_at: null,
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[Stripe Connect] Failed to reset inaccessible account:', error);
  }
}

export async function createStripeConnectOnboardingLink(
  stripe: Stripe,
  accountId: string,
  baseUrl: string
) {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/marketplace/settings?stripe=refresh`,
    return_url: `${baseUrl}/marketplace/settings?stripe=success`,
    type: 'account_onboarding',
  });
}

export async function createStripeExpressAccount({
  stripe,
  supabase,
  userId,
  userEmail,
  profile,
  baseUrl,
}: CreateExpressAccountArgs) {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'AU',
    email: profile.email || userEmail || undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    business_profile: {
      name: profile.business_name || profile.name || undefined,
      product_description: 'Selling cycling products on Yellow Jersey Marketplace',
    },
    metadata: {
      user_id: userId,
      platform: 'yellow_jersey',
    },
  });

  const { error: updateError } = await supabase
    .from('users')
    .update({
      stripe_account_id: account.id,
      stripe_account_status: 'pending',
      stripe_connected_at: new Date().toISOString(),
      stripe_onboarding_complete: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('[Stripe Connect] Failed to save account ID:', updateError);
  }

  const accountLink = await createStripeConnectOnboardingLink(stripe, account.id, baseUrl);

  return { account, accountLink };
}
