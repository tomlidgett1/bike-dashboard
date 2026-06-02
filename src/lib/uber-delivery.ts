import type { SupabaseClient } from '@supabase/supabase-js';

export const UBER_EXPRESS_FEE = 15;
export const UBER_RADIUS_KM = 10;

const ASHBURTON_CYCLES_FALLBACK = {
  lat: -37.8673,
  lng: 145.0824,
  name: 'Ashburton Cycles',
};

export interface UberAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface UberProductInput {
  id: string;
  user_id: string;
  uber_delivery_enabled?: boolean | null;
  display_name?: string | null;
  description?: string | null;
}

export interface UberSellerProfile {
  user_id: string;
  business_name?: string | null;
  account_type?: string | null;
  bicycle_store?: boolean | null;
  address?: string | null;
  phone?: string | null;
  uber_notification_phones?: string[] | null;
}

interface UberDeliveryValidationArgs {
  products: UberProductInput[];
  sellerId?: string | null;
  shippingAddress?: UberAddress | null;
  requireAddress?: boolean;
}

export interface UberDeliveryValidationResult {
  eligible: boolean;
  reason?: string;
  distance: number | null;
  maxRadius: number;
  storeName?: string;
  seller?: UberSellerProfile | null;
}

interface UberUniversalLinkLocation {
  latitude?: number | null;
  longitude?: number | null;
  nickname?: string | null;
  formattedAddress?: string | null;
}

interface UberUniversalLinkArgs {
  pickup: UberUniversalLinkLocation;
  dropoff: UberUniversalLinkLocation;
}

interface UberOrderTripLinkArgs {
  pickupAddress?: string | null;
  pickupName?: string | null;
  dropoffAddress?: string | null;
  dropoffName?: string | null;
}

interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
}

type SupabaseLike = Pick<SupabaseClient, 'from'>;

function getUberClientId(): string | null {
  return process.env.UBER_CLIENT_ID || process.env.NEXT_PUBLIC_UBER_CLIENT_ID || null;
}

function buildUberQueryString(entries: Array<[string, string | null | undefined]>): string {
  return entries
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function roundedDistance(distance: number): number {
  return Math.round(distance * 10) / 10;
}

function addressToString(address: UberAddress): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .join(', ');
}

function isAshburtonCycles(seller: UberSellerProfile): boolean {
  return (seller.business_name || '').trim().toLowerCase() === 'ashburton cycles';
}

function hasCoordinates(location: UberUniversalLinkLocation): location is UberUniversalLinkLocation & {
  latitude: number;
  longitude: number;
} {
  return typeof location.latitude === 'number' && typeof location.longitude === 'number';
}

function appendUberLocationParams(
  params: URLSearchParams,
  prefix: 'pickup' | 'dropoff',
  location: UberUniversalLinkLocation
): void {
  if (hasCoordinates(location)) {
    params.set(`${prefix}[latitude]`, String(location.latitude));
    params.set(`${prefix}[longitude]`, String(location.longitude));
  }

  const nickname = location.nickname?.trim();
  if (nickname) params.set(`${prefix}[nickname]`, nickname);

  const formattedAddress = location.formattedAddress?.trim();
  if (formattedAddress) params.set(`${prefix}[formatted_address]`, formattedAddress);
}

export function createUberUniversalLink({ pickup, dropoff }: UberUniversalLinkArgs): string | null {
  const pickupHasUsableLocation = hasCoordinates(pickup) || !!pickup.formattedAddress?.trim();
  const dropoffHasUsableLocation = hasCoordinates(dropoff) || !!dropoff.formattedAddress?.trim();

  if (!pickupHasUsableLocation || !dropoffHasUsableLocation) return null;

  const params = new URLSearchParams();
  params.set('action', 'setPickup');
  appendUberLocationParams(params, 'pickup', pickup);
  appendUberLocationParams(params, 'dropoff', dropoff);

  return `https://m.uber.com/ul/?${params.toString()}`;
}

export function isVerifiedBikeStore(seller: UberSellerProfile | null | undefined): boolean {
  return seller?.account_type === 'bicycle_store' && seller?.bicycle_store === true;
}

export function normaliseUberNotificationPhones(phones: unknown): string[] {
  if (!Array.isArray(phones)) return [];

  const seen = new Set<string>();
  const normalised: string[] = [];

  for (const phone of phones) {
    if (typeof phone !== 'string') continue;
    const cleaned = phone.trim().replace(/[^\d+]/g, '');
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    normalised.push(cleaned);
  }

  return normalised.slice(0, 10);
}

export function getUberNotificationPhones(seller: UberSellerProfile | null | undefined): string[] {
  if (!seller) return [];

  const configured = normaliseUberNotificationPhones(seller.uber_notification_phones);
  if (configured.length > 0) return configured;

  const fallback = normaliseUberNotificationPhones([seller.phone]);
  if (fallback.length > 0) return fallback;

  return isAshburtonCycles(seller) ? ['0414187820'] : [];
}

async function geocodeAddressString(address: string): Promise<GeocodedLocation | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('[Uber Delivery] Google Maps API key not configured');
    return null;
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('region', 'au');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status === 'OK' && data.results?.length > 0) {
      const result = data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
      };
    }

    console.warn('[Uber Delivery] Geocoding failed:', data.status, data.error_message);
    return null;
  } catch (error) {
    console.error('[Uber Delivery] Geocoding error:', error);
    return null;
  }
}

async function getSellerProfile(
  supabase: SupabaseLike,
  sellerId: string
): Promise<UberSellerProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, business_name, account_type, bicycle_store, address, phone, uber_notification_phones')
    .eq('user_id', sellerId)
    .maybeSingle();

  if (error) {
    console.error('[Uber Delivery] Seller profile fetch error:', error);
    return null;
  }

  return (data as UberSellerProfile | null) ?? null;
}

async function getStoreLocation(seller: UberSellerProfile): Promise<GeocodedLocation | null> {
  const address = seller.address?.trim();
  if (address) {
    const geocoded = await geocodeAddressString(address);
    if (geocoded) return geocoded;
  }

  if (isAshburtonCycles(seller)) {
    return {
      lat: ASHBURTON_CYCLES_FALLBACK.lat,
      lng: ASHBURTON_CYCLES_FALLBACK.lng,
      formattedAddress: ASHBURTON_CYCLES_FALLBACK.name,
    };
  }

  return null;
}

export async function createUberOrderTripLink({
  dropoffAddress,
  dropoffName,
}: UberOrderTripLinkArgs): Promise<string | null> {
  const cleanDropoffAddress = dropoffAddress?.trim();

  if (!cleanDropoffAddress) return null;

  const dropoffLocation = await geocodeAddressString(cleanDropoffAddress);

  if (!dropoffLocation) return null;

  const dropoffPayload = {
    latitude: dropoffLocation.lat,
    longitude: dropoffLocation.lng,
    addressLine1: dropoffName || dropoffLocation.formattedAddress || cleanDropoffAddress,
    addressLine2: dropoffLocation.formattedAddress || cleanDropoffAddress,
  };

  const query = buildUberQueryString([
    ['client_id', getUberClientId()],
    ['pickup', 'my_location'],
    ['drop[0]', JSON.stringify(dropoffPayload)],
  ]);

  return `https://m.uber.com/looking?${query}`;
}

export async function validateUberDelivery(
  supabase: SupabaseLike,
  args: UberDeliveryValidationArgs
): Promise<UberDeliveryValidationResult> {
  const sellerId = args.sellerId || args.products[0]?.user_id;
  if (!sellerId) {
    return {
      eligible: false,
      reason: 'Uber Express requires a store seller.',
      distance: null,
      maxRadius: UBER_RADIUS_KM,
    };
  }

  if (args.products.length === 0) {
    return {
      eligible: false,
      reason: 'Uber Express requires at least one product.',
      distance: null,
      maxRadius: UBER_RADIUS_KM,
    };
  }

  const mixedSeller = args.products.some((product) => product.user_id !== sellerId);
  if (mixedSeller) {
    return {
      eligible: false,
      reason: 'Uber Express is only available for a single bike store order.',
      distance: null,
      maxRadius: UBER_RADIUS_KM,
    };
  }

  const seller = await getSellerProfile(supabase, sellerId);
  const storeName = seller?.business_name || 'this store';

  if (!isVerifiedBikeStore(seller)) {
    return {
      eligible: false,
      reason: 'Uber Express is only available from verified bike stores.',
      distance: null,
      maxRadius: UBER_RADIUS_KM,
      storeName,
      seller,
    };
  }

  const ineligibleProduct = args.products.find((product) => !product.uber_delivery_enabled);
  if (ineligibleProduct) {
    return {
      eligible: false,
      reason: 'Every item in the cart must be enabled for Uber Express.',
      distance: null,
      maxRadius: UBER_RADIUS_KM,
      storeName,
      seller,
    };
  }

  if (!args.shippingAddress) {
    return {
      eligible: !args.requireAddress,
      reason: args.requireAddress ? 'A delivery address is required for Uber Express.' : undefined,
      distance: null,
      maxRadius: UBER_RADIUS_KM,
      storeName,
      seller,
    };
  }

  const storeLocation = await getStoreLocation(seller!);
  if (!storeLocation) {
    return {
      eligible: false,
      reason: `${storeName} needs a store address before Uber Express can be offered.`,
      distance: null,
      maxRadius: UBER_RADIUS_KM,
      storeName,
      seller,
    };
  }

  const deliveryLocation = await geocodeAddressString(addressToString(args.shippingAddress));
  if (!deliveryLocation) {
    return {
      eligible: true,
      reason: 'Address validation unavailable.',
      distance: null,
      maxRadius: UBER_RADIUS_KM,
      storeName,
      seller,
    };
  }

  const distance = roundedDistance(
    calculateHaversineDistance(
      deliveryLocation.lat,
      deliveryLocation.lng,
      storeLocation.lat,
      storeLocation.lng
    )
  );

  const eligible = distance <= UBER_RADIUS_KM;

  return {
    eligible,
    reason: eligible
      ? `You're ${distance.toFixed(1)}km from ${storeName} - Uber Express is available.`
      : `You're ${distance.toFixed(1)}km from ${storeName}. Uber Express is only available within ${UBER_RADIUS_KM}km.`,
    distance,
    maxRadius: UBER_RADIUS_KM,
    storeName,
    seller,
  };
}
