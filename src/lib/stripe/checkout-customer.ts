import type Stripe from 'stripe';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export const CHECKOUT_SHIPPING_ALLOWED_COUNTRIES = ['AU', 'NZ'] as const;
export const CHECKOUT_PHONE_NUMBER_COLLECTION = {
  enabled: true,
} satisfies Stripe.Checkout.SessionCreateParams.PhoneNumberCollection;

const ALLOWED_COUNTRIES = new Set<string>(CHECKOUT_SHIPPING_ALLOWED_COUNTRIES);

export interface CheckoutShippingAddressInput {
  name?: string | null;
  phone?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

interface CheckoutProfileRow {
  shipping_address?: unknown;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

interface CheckoutShippingDetails {
  name: string;
  phone?: string;
  address: Stripe.ShippingAddressParam;
}

interface CreateCheckoutCustomerPrefillArgs {
  stripe: Stripe;
  supabase: SupabaseClient;
  user: User;
  shippingAddress?: CheckoutShippingAddressInput | null;
}

interface CheckoutCustomerPrefill {
  customerParams: Pick<
    Stripe.Checkout.SessionCreateParams,
    'customer' | 'customer_email' | 'customer_update'
  >;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return asRecord(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeCountry(value: unknown): string {
  const country = text(value).toUpperCase();
  if (country === 'AUSTRALIA') return 'AU';
  if (country === 'NEW ZEALAND' || country === 'NEWZEALAND') return 'NZ';
  return country || 'AU';
}

function displayNameFromProfile(profile: CheckoutProfileRow | null, user: User): string {
  const fullName = text(profile?.name);
  if (fullName) return fullName;

  const first = text(profile?.first_name);
  const last = text(profile?.last_name);
  const joined = [first, last].filter(Boolean).join(' ');
  if (joined) return joined;

  const metadataName = text(user.user_metadata?.full_name) || text(user.user_metadata?.name);
  if (metadataName) return metadataName;

  return 'Customer';
}

function normalizeShippingAddress(
  source: unknown,
  fallback: { name: string; phone?: string | null }
): CheckoutShippingDetails | null {
  const record = asRecord(source);
  if (!record) return null;

  const line1 = text(record.line1);
  if (!line1) return null;

  const country = normalizeCountry(record.country);
  if (!ALLOWED_COUNTRIES.has(country)) return null;

  const address: Stripe.ShippingAddressParam = {
    line1,
    country,
  };

  const line2 = text(record.line2);
  const city = text(record.city);
  const state = text(record.state);
  const postalCode = text(record.postal_code) || text(record.postalCode);

  if (line2) address.line2 = line2;
  if (city) address.city = city;
  if (state) address.state = state;
  if (postalCode) address.postal_code = postalCode;

  const name = text(record.name) || fallback.name;
  const phone = text(record.phone) || text(fallback.phone);

  return {
    name,
    ...(phone && { phone }),
    address,
  };
}

async function fetchCheckoutProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<CheckoutProfileRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('shipping_address, name, first_name, last_name, phone')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[Stripe Checkout] Could not load buyer profile for address prefill:', error.message);
    return null;
  }

  return data as CheckoutProfileRow | null;
}

export async function createCheckoutCustomerPrefill({
  stripe,
  supabase,
  user,
  shippingAddress,
}: CreateCheckoutCustomerPrefillArgs): Promise<CheckoutCustomerPrefill> {
  const profile = await fetchCheckoutProfile(supabase, user.id);
  const fallback = {
    name: displayNameFromProfile(profile, user),
    phone: profile?.phone ?? null,
  };

  const shipping =
    normalizeShippingAddress(shippingAddress, fallback) ||
    normalizeShippingAddress(profile?.shipping_address, fallback);

  if (!shipping) {
    return {
      customerParams: user.email ? { customer_email: user.email } : {},
    };
  }

  const customer = await stripe.customers.create({
    ...(user.email && { email: user.email }),
    name: shipping.name,
    ...(shipping.phone && { phone: shipping.phone }),
    address: shipping.address,
    shipping,
    metadata: {
      app_user_id: user.id,
    },
  });

  return {
    customerParams: {
      customer: customer.id,
      customer_update: {
        address: 'auto',
        name: 'auto',
        shipping: 'auto',
      },
    },
  };
}
