// ============================================================
// Stripe Payment Intent Creation API
// ============================================================
// POST: Creates a Stripe PaymentIntent for embedded checkout
// Supports dynamic delivery method selection (Uber Express, Pickup, Shipping)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, calculatePlatformFee, calculateSellerPayout, calculateBuyerFee } from '@/lib/stripe';
import { resolveLivePrice } from '@/lib/marketplace/pricing';
import { UBER_EXPRESS_FEE, UBER_RADIUS_KM, validateUberDelivery } from '@/lib/uber-delivery';

// Delivery fees
const AUSPOST_FEE = 12;

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
        discount_percent,
        discount_active,
        discount_ends_at,
        sale_price,
        shipping_available,
        shipping_cost,
        pickup_location,
        images,
        user_id,
        is_active,
        sold_at,
        listing_status,
        uber_delivery_enabled
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

    const uberAvailability = await validateUberDelivery(supabase, {
      sellerId: product.user_id,
      products: [product],
      requireAddress: false,
    });

    if (deliveryMethod === 'uber_express' && shippingAddress) {
      const eligibility = await validateUberDelivery(supabase, {
        sellerId: product.user_id,
        products: [product],
        shippingAddress,
        requireAddress: true,
      });
      
      if (!eligibility.eligible) {
        console.warn('[PaymentIntent] Uber delivery rejected - address outside 10km radius:', {
          distance: eligibility.distance,
        });
        return NextResponse.json(
          { 
            error: eligibility.reason || `Uber Express is only available within ${UBER_RADIUS_KM}km of this store. Please select Australia Post or Pickup.`,
            uberIneligible: true,
            distance: eligibility.distance,
          },
          { status: 400 }
        );
      }
    } else if (deliveryMethod === 'uber_express') {
      return NextResponse.json(
        {
          error: 'A delivery address is required for Uber Express.',
          uberIneligible: true,
        },
        { status: 400 }
      );
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

    // Calculate base totals.
    // Honour any live discount so the embedded checkout charges the same sale
    // price shown on the listing. resolveLivePrice re-validates active/expiry/
    // saving server-side; all downstream math derives from itemPrice.
    const livePrice = resolveLivePrice(product);
    const itemPrice = livePrice.price;
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
        available: uberAvailability.eligible,
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

    // Record the discount for the order trail when the item is on sale
    if (livePrice.onSale) {
      metadata.original_price = Number(product.price).toString();
      metadata.discount_percent = String(livePrice.percentOff);
    }

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

    // Fetch product for recalculation
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, price, discount_percent, discount_active, discount_ends_at, sale_price, shipping_available, shipping_cost, pickup_location, display_name, description, user_id, uber_delivery_enabled')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (deliveryMethod === 'uber_express') {
      const eligibility = await validateUberDelivery(supabase, {
        sellerId: product.user_id,
        products: [product],
        shippingAddress,
        requireAddress: true,
      });
      
      if (!eligibility.eligible) {
        console.warn('[PaymentIntent] Uber delivery rejected on update:', {
          distance: eligibility.distance,
        });
        return NextResponse.json(
          { 
            error: eligibility.reason || `Uber Express is only available within ${UBER_RADIUS_KM}km of this store.`,
            uberIneligible: true,
            distance: eligibility.distance,
          },
          { status: 400 }
        );
      }
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

    // Recalculate base totals (honour any live discount, same as POST)
    const livePrice = resolveLivePrice(product);
    const itemPrice = livePrice.price;
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

    if (livePrice.onSale) {
      metadata.original_price = Number(product.price).toString();
      metadata.discount_percent = String(livePrice.percentOff);
    }

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
