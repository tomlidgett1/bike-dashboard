// ============================================================
// Uber Delivery Eligibility Check API
// ============================================================
// POST: Checks if a delivery address is within 10km of Ashburton Cycles
// Uses Google Maps Geocoding API for address-to-coordinates conversion
// and Haversine formula for distance calculation

import { NextRequest, NextResponse } from 'next/server';

// Ashburton Cycles location (Ashburton, VIC)
const ASHBURTON_CYCLES = {
  lat: -37.8673,
  lng: 145.0824,
  name: 'Ashburton Cycles',
};

// Maximum distance for Uber Express delivery (in km)
const UBER_RADIUS_KM = 10;

interface CheckEligibilityRequest {
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

interface GeocodingResult {
  results: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    formatted_address: string;
  }>;
  status: string;
  error_message?: string;
}

/**
 * Calculate the Haversine distance between two coordinates
 * Returns distance in kilometres
 */
function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Geocode an address using Google Maps Geocoding API
 */
async function geocodeAddress(address: CheckEligibilityRequest['address']): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
} | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('[Eligibility] Google Maps API key not configured');
    return null;
  }

  // Build address string
  const addressParts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter(Boolean);

  const addressString = addressParts.join(', ');

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', addressString);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('region', 'au'); // Bias towards Australia

    const response = await fetch(url.toString());
    const data: GeocodingResult = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
      };
    }

    console.error('[Eligibility] Geocoding failed:', data.status, data.error_message);
    return null;
  } catch (error) {
    console.error('[Eligibility] Geocoding error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckEligibilityRequest = await request.json();

    if (!body.address || !body.address.line1 || !body.address.city) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // Geocode the delivery address
    const location = await geocodeAddress(body.address);

    if (!location) {
      // If geocoding fails, assume eligible (fail open for better UX)
      // Backend validation will catch invalid addresses
      console.warn('[Eligibility] Could not geocode address, defaulting to eligible');
      return NextResponse.json({
        eligible: true,
        distance: null,
        message: 'Address validation unavailable',
        fallback: true,
      });
    }

    // Calculate distance from Ashburton Cycles
    const distance = calculateHaversineDistance(
      location.lat,
      location.lng,
      ASHBURTON_CYCLES.lat,
      ASHBURTON_CYCLES.lng
    );

    const eligible = distance <= UBER_RADIUS_KM;

    console.log('[Eligibility] Check result:', {
      address: location.formattedAddress,
      coordinates: { lat: location.lat, lng: location.lng },
      distance: `${distance.toFixed(2)}km`,
      eligible,
    });

    return NextResponse.json({
      eligible,
      distance: Math.round(distance * 10) / 10, // Round to 1 decimal place
      maxRadius: UBER_RADIUS_KM,
      storeName: ASHBURTON_CYCLES.name,
      message: eligible
        ? `You're ${distance.toFixed(1)}km from ${ASHBURTON_CYCLES.name} - Uber Express is available!`
        : `You're ${distance.toFixed(1)}km from ${ASHBURTON_CYCLES.name}. Uber Express is only available within ${UBER_RADIUS_KM}km.`,
      deliveryAddress: location.formattedAddress,
    });
  } catch (error) {
    console.error('[Eligibility] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check delivery eligibility' },
      { status: 500 }
    );
  }
}

