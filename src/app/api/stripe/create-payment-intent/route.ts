// ============================================================
// Stripe Payment Intent Creation API
// ============================================================
// POST: Creates a Stripe PaymentIntent for embedded checkout
// Supports dynamic delivery method selection (Uber Express, Pickup, Shipping)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, calculatePlatformFee, calculateSellerPayout, calculateBuyerFee } from '@/lib/stripe';

// Delivery fees
const UBER_EXPRESS_FEE = 15;
const AUSPOST_FEE = 12;

// Ashburton Cycles location for Uber eligibility
const ASHBURTON_CYCLES = {
  lat: -37.8673,
  lng: 145.0824,
};
const UBER_RADIUS_KM = 10;

export type DeliveryMethod = 'uber_express' | 'auspost' | 'pickup' | 'shipping';

interface CreatePaymentIntentRequest {
  productId: string;
  deliveryMethod: DeliveryMethod;
  shippingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

// ============================================================
// Haversine Distance Calculation
// ============================================================

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

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

// ============================================================
// Geocode Address (for server-side validation)
// ============================================================

async function geocodeAddress(address: {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('[PaymentIntent] Google Maps API key not configured, skipping eligibility check');
    return null;
  }

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
    url.searchParams.set('region', 'au');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      return {
        lat: data.results[0].geometry.location.lat,
        lng: data.results[0].geometry.location.lng,
      };
    }

    console.warn('[PaymentIntent] Geocoding failed:', data.status);
    return null;
  } catch (error) {
    console.error('[PaymentIntent] Geocoding error:', error);
    return null;
  }
}

// ============================================================
// Check Uber Eligibility
// ============================================================

async function checkUberEligibility(address: {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}): Promise<{ eligible: boolean; distance: number | null }> {
  const location = await geocodeAddress(address);

  if (!location) {
    // If geocoding fails, fail open (allow Uber)
    console.warn('[PaymentIntent] Could not geocode address, allowing Uber delivery');
    return { eligible: true, distance: null };
  }

  const distance = calculateHaversineDistance(
    location.lat,
    location.lng,
    ASHBURTON_CYCLES.lat,
    ASHBURTON_CYCLES.lng
  );

  return {
    eligible: distance <= UBER_RADIUS_KM,
    distance: Math.round(distance * 10) / 10,
  };
}

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
        { error: 'Unauthorised - please sign in to purchase' },
        { status: 401 }
      );
    }

    const body: CreatePaymentIntentRequest = await request.json();
    const { productId, deliveryMethod = 'auspost', shippingAddress } = body;

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Fetch product details and verify it's available
    const { data: product, error: productError } = await supabase
      .from('products')
      .select(`
        id,
        description,
        display_name,
        price,
        shipping_available,
        shipping_cost,
        pickup_location,
        images,
        user_id,
        is_active,
        sold_at,
        listing_status
      `)
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('[PaymentIntent] Product fetch error:', productError);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Validate product is available for purchase
    if (!product.is_active) {
      return NextResponse.json(
        { error: 'This product is no longer available' },
        { status: 400 }
      );
    }

    if (product.sold_at) {
      return NextResponse.json(
        { error: 'This product has already been sold' },
        { status: 400 }
      );
    }

    if (product.listing_status === 'sold') {
      return NextResponse.json(
        { error: 'This product has already been sold' },
        { status: 400 }
      );
    }

    // Prevent buying your own product
    if (product.user_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot purchase your own product' },
        { status: 400 }
      );
    }

    // Server-side validation for Uber Express eligibility
    // If user selected uber_express and provided an address, validate it
    if (deliveryMethod === 'uber_express' && shippingAddress) {
      const eligibility = await checkUberEligibility(shippingAddress);
      
      if (!eligibility.eligible) {
        console.warn('[PaymentIntent] Uber delivery rejected - address outside 10km radius:', {
          distance: eligibility.distance,
        });
        return NextResponse.json(
          { 
            error: `Uber Express is only available within ${UBER_RADIUS_KM}km of Ashburton Cycles. Your address is ${eligibility.distance}km away. Please select Australia Post or Pickup.`,
            uberIneligible: true,
            distance: eligibility.distance,
          },
          { status: 400 }
        );
      }
    }

    // Calculate delivery cost based on method
    let deliveryCost = 0;
    let deliveryDescription = '';

    switch (deliveryMethod) {
      case 'uber_express':
        deliveryCost = UBER_EXPRESS_FEE;
        deliveryDescription = 'Uber Express (1-hour delivery)';
        break;
      case 'auspost':
        deliveryCost = AUSPOST_FEE;
        deliveryDescription = 'Australia Post (2-5 business days)';
        break;
      case 'pickup':
        deliveryCost = 0;
        deliveryDescription = 'Local Pickup';
        break;
      case 'shipping':
        deliveryCost = product.shipping_available ? (product.shipping_cost || 0) : 0;
        deliveryDescription = 'Standard Shipping';
        break;
    }

    // Calculate base totals
    const itemPrice = product.price;
    const itemPriceCents = Math.round(itemPrice * 100);
    const buyerFee = calculateBuyerFee(itemPrice); // 0.5% buyer service fee

    // ============================================================
    // Check for applicable voucher (First Upload Promo)
    // ============================================================
    let voucherDiscount = 0;
    let voucherDiscountCents = 0;
    let applicableVoucher: { id: string; amount_cents: number; description: string } | null = null;

    // Only apply voucher if item price is >= $30 (minimum purchase requirement)
    const MIN_PURCHASE_FOR_VOUCHER_CENTS = 3000;
    
    if (itemPriceCents >= MIN_PURCHASE_FOR_VOUCHER_CENTS) {
      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .select('id, amount_cents, min_purchase_cents, description, voucher_type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .lte('min_purchase_cents', itemPriceCents)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('amount_cents', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!voucherError && voucher) {
        applicableVoucher = {
          id: voucher.id,
          amount_cents: voucher.amount_cents,
          description: voucher.description || 'Yellow Jersey discount',
        };
        voucherDiscountCents = voucher.amount_cents;
        voucherDiscount = voucherDiscountCents / 100;
        console.log('[PaymentIntent] Applying voucher:', {
          voucherId: voucher.id,
          type: voucher.voucher_type,
          discount: voucherDiscount,
        });
      }
    }

    // Calculate final totals (with voucher discount applied)
    const totalBeforeDiscount = itemPrice + deliveryCost + buyerFee;
    const totalAmount = Math.max(0, totalBeforeDiscount - voucherDiscount);
    const totalAmountCents = Math.round(totalAmount * 100);

    // Determine available delivery options
    const deliveryOptions = [
      {
        id: 'uber_express' as DeliveryMethod,
        label: 'Uber Express',
        description: 'Get it in 1 hour',
        cost: UBER_EXPRESS_FEE,
        available: true, // Eligibility checked client-side based on address
      },
      {
        id: 'auspost' as DeliveryMethod,
        label: 'Australia Post',
        description: '2-5 business days',
        cost: AUSPOST_FEE,
        available: true, // Always available
      },
      {
        id: 'pickup' as DeliveryMethod,
        label: 'Local Pickup',
        description: product.pickup_location || 'Pickup from seller',
        cost: 0,
        available: !!product.pickup_location,
      },
    ];

    // Build metadata with optional voucher fields
    const metadata: Record<string, string> = {
      product_id: product.id,
      buyer_id: user.id,
      seller_id: product.user_id,
      item_price: itemPrice.toString(),
      delivery_method: deliveryMethod,
      delivery_cost: deliveryCost.toString(),
      delivery_description: deliveryDescription,
      buyer_fee: buyerFee.toString(),
      total_amount: totalAmount.toString(),
      platform_fee: calculatePlatformFee(itemPrice).toString(),
      seller_payout: calculateSellerPayout(itemPrice).toString(),
    };

    // Add voucher info to metadata if applicable
    if (applicableVoucher) {
      metadata.voucher_id = applicableVoucher.id;
      metadata.voucher_discount = voucherDiscount.toString();
      metadata.voucher_discount_cents = voucherDiscountCents.toString();
    }

    // Create Stripe PaymentIntent
    // Explicitly set payment methods: card (includes Apple Pay/Google Pay wallets)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountCents,
      currency: 'aud',
      payment_method_types: ['card', 'link'],
      metadata,
      description: `${product.display_name || product.description} - ${deliveryDescription}${applicableVoucher ? ' (includes $' + voucherDiscount + ' discount)' : ''}`,
    });

    console.log('[PaymentIntent] Created:', {
      intentId: paymentIntent.id,
      productId: product.id,
      buyerId: user.id,
      deliveryMethod,
      total: totalAmount,
      voucherApplied: !!applicableVoucher,
      voucherDiscount: voucherDiscount,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      breakdown: {
        itemPrice,
        deliveryCost,
        buyerFee,
        voucherDiscount,
        totalBeforeDiscount,
        totalAmount,
      },
      deliveryOptions,
      product: {
        id: product.id,
        name: product.display_name || product.description,
        price: product.price,
      },
      voucher: applicableVoucher ? {
        id: applicableVoucher.id,
        discount: voucherDiscount,
        description: applicableVoucher.description,
      } : null,
    });

  } catch (error) {
    console.error('[PaymentIntent] Error creating intent:', error);
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH: Update PaymentIntent with new delivery method
// ============================================================

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { paymentIntentId, productId, deliveryMethod, shippingAddress } = body;

    if (!paymentIntentId || !productId || !deliveryMethod) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Server-side validation for Uber Express eligibility
    if (deliveryMethod === 'uber_express' && shippingAddress) {
      const eligibility = await checkUberEligibility(shippingAddress);
      
      if (!eligibility.eligible) {
        console.warn('[PaymentIntent] Uber delivery rejected on update:', {
          distance: eligibility.distance,
        });
        return NextResponse.json(
          { 
            error: `Uber Express is only available within ${UBER_RADIUS_KM}km of Ashburton Cycles. Your address is ${eligibility.distance}km away.`,
            uberIneligible: true,
            distance: eligibility.distance,
          },
          { status: 400 }
        );
      }
    }

    // Fetch product for recalculation
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, price, shipping_available, shipping_cost, pickup_location, display_name, description, user_id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Calculate new delivery cost
    let deliveryCost = 0;
    let deliveryDescription = '';

    switch (deliveryMethod) {
      case 'uber_express':
        deliveryCost = UBER_EXPRESS_FEE;
        deliveryDescription = 'Uber Express (1-hour delivery)';
        break;
      case 'auspost':
        deliveryCost = AUSPOST_FEE;
        deliveryDescription = 'Australia Post (2-5 business days)';
        break;
      case 'pickup':
        deliveryCost = 0;
        deliveryDescription = 'Local Pickup';
        break;
      case 'shipping':
        deliveryCost = product.shipping_available ? (product.shipping_cost || 0) : 0;
        deliveryDescription = 'Standard Shipping';
        break;
    }

    // Recalculate base totals
    const itemPrice = product.price;
    const itemPriceCents = Math.round(itemPrice * 100);
    const buyerFee = calculateBuyerFee(itemPrice);

    // Check for applicable voucher
    let voucherDiscount = 0;
    let voucherDiscountCents = 0;
    let applicableVoucher: { id: string; amount_cents: number; description: string } | null = null;

    const MIN_PURCHASE_FOR_VOUCHER_CENTS = 3000;
    
    if (itemPriceCents >= MIN_PURCHASE_FOR_VOUCHER_CENTS) {
      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .select('id, amount_cents, min_purchase_cents, description, voucher_type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .lte('min_purchase_cents', itemPriceCents)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('amount_cents', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!voucherError && voucher) {
        applicableVoucher = {
          id: voucher.id,
          amount_cents: voucher.amount_cents,
          description: voucher.description || 'Yellow Jersey discount',
        };
        voucherDiscountCents = voucher.amount_cents;
        voucherDiscount = voucherDiscountCents / 100;
      }
    }

    // Calculate final totals
    const totalBeforeDiscount = itemPrice + deliveryCost + buyerFee;
    const totalAmount = Math.max(0, totalBeforeDiscount - voucherDiscount);
    const totalAmountCents = Math.round(totalAmount * 100);

    // Build metadata
    const metadata: Record<string, string> = {
      product_id: product.id,
      buyer_id: user.id,
      seller_id: product.user_id,
      item_price: itemPrice.toString(),
      delivery_method: deliveryMethod,
      delivery_cost: deliveryCost.toString(),
      delivery_description: deliveryDescription,
      buyer_fee: buyerFee.toString(),
      total_amount: totalAmount.toString(),
      platform_fee: calculatePlatformFee(itemPrice).toString(),
      seller_payout: calculateSellerPayout(itemPrice).toString(),
    };

    if (applicableVoucher) {
      metadata.voucher_id = applicableVoucher.id;
      metadata.voucher_discount = voucherDiscount.toString();
      metadata.voucher_discount_cents = voucherDiscountCents.toString();
    }

    // Update PaymentIntent
    const updatedIntent = await stripe.paymentIntents.update(paymentIntentId, {
      amount: totalAmountCents,
      metadata,
      description: `${product.display_name || product.description} - ${deliveryDescription}${applicableVoucher ? ' (includes $' + voucherDiscount + ' discount)' : ''}`,
    });

    console.log('[PaymentIntent] Updated:', {
      intentId: updatedIntent.id,
      deliveryMethod,
      newTotal: totalAmount,
      voucherApplied: !!applicableVoucher,
    });

    return NextResponse.json({
      clientSecret: updatedIntent.client_secret,
      breakdown: {
        itemPrice,
        deliveryCost,
        buyerFee,
        voucherDiscount,
        totalBeforeDiscount,
        totalAmount,
      },
      voucher: applicableVoucher ? {
        id: applicableVoucher.id,
        discount: voucherDiscount,
        description: applicableVoucher.description,
      } : null,
    });

  } catch (error) {
    console.error('[PaymentIntent] Error updating intent:', error);
    return NextResponse.json(
      { error: 'Failed to update payment intent' },
      { status: 500 }
    );
  }
}
