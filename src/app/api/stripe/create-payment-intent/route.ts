// ============================================================
// Stripe Payment Intent Creation API
// ============================================================
// POST: Creates a Stripe PaymentIntent for embedded checkout
// Supports dynamic delivery method selection (Uber Express, Pickup, Shipping)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, calculatePlatformFee, calculateSellerPayout, calculateBuyerFee } from '@/lib/stripe';

// Uber Express delivery flat fee
const UBER_EXPRESS_FEE = 15;

export type DeliveryMethod = 'uber_express' | 'pickup' | 'shipping';

interface CreatePaymentIntentRequest {
  productId: string;
  deliveryMethod: DeliveryMethod;
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
    const { productId, deliveryMethod = 'uber_express' } = body;

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

    // Calculate delivery cost based on method
    let deliveryCost = 0;
    let deliveryDescription = '';

    switch (deliveryMethod) {
      case 'uber_express':
        deliveryCost = UBER_EXPRESS_FEE;
        deliveryDescription = 'Uber Express (1-hour delivery)';
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

    // Calculate totals
    const itemPrice = product.price;
    const buyerFee = calculateBuyerFee(itemPrice); // 0.5% buyer service fee
    const totalAmount = itemPrice + deliveryCost + buyerFee;
    const totalAmountCents = Math.round(totalAmount * 100);

    // Determine available delivery options
    const deliveryOptions = [
      {
        id: 'uber_express' as DeliveryMethod,
        label: 'Uber Express',
        description: 'Get it in 1 hour',
        cost: UBER_EXPRESS_FEE,
        available: true, // Always available
      },
      {
        id: 'pickup' as DeliveryMethod,
        label: 'Local Pickup',
        description: product.pickup_location || 'Pickup from seller',
        cost: 0,
        available: !!product.pickup_location,
      },
      {
        id: 'shipping' as DeliveryMethod,
        label: 'Standard Shipping',
        description: 'Delivered to your address',
        cost: product.shipping_cost || 0,
        available: !!product.shipping_available,
      },
    ];

    // Create Stripe PaymentIntent
    // Explicitly set payment methods: card (includes Apple Pay/Google Pay wallets)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountCents,
      currency: 'aud',
      payment_method_types: ['card', 'link'],
      metadata: {
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
      },
      description: `${product.display_name || product.description} - ${deliveryDescription}`,
    });

    console.log('[PaymentIntent] Created:', {
      intentId: paymentIntent.id,
      productId: product.id,
      buyerId: user.id,
      deliveryMethod,
      total: totalAmount,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      breakdown: {
        itemPrice,
        deliveryCost,
        buyerFee,
        totalAmount,
      },
      deliveryOptions,
      product: {
        id: product.id,
        name: product.display_name || product.description,
        price: product.price,
      },
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
    const { paymentIntentId, productId, deliveryMethod } = body;

    if (!paymentIntentId || !productId || !deliveryMethod) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
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
      case 'pickup':
        deliveryCost = 0;
        deliveryDescription = 'Local Pickup';
        break;
      case 'shipping':
        deliveryCost = product.shipping_available ? (product.shipping_cost || 0) : 0;
        deliveryDescription = 'Standard Shipping';
        break;
    }

    // Recalculate totals
    const itemPrice = product.price;
    const buyerFee = calculateBuyerFee(itemPrice);
    const totalAmount = itemPrice + deliveryCost + buyerFee;
    const totalAmountCents = Math.round(totalAmount * 100);

    // Update PaymentIntent
    const updatedIntent = await stripe.paymentIntents.update(paymentIntentId, {
      amount: totalAmountCents,
      metadata: {
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
      },
      description: `${product.display_name || product.description} - ${deliveryDescription}`,
    });

    console.log('[PaymentIntent] Updated:', {
      intentId: updatedIntent.id,
      deliveryMethod,
      newTotal: totalAmount,
    });

    return NextResponse.json({
      clientSecret: updatedIntent.client_secret,
      breakdown: {
        itemPrice,
        deliveryCost,
        buyerFee,
        totalAmount,
      },
    });

  } catch (error) {
    console.error('[PaymentIntent] Error updating intent:', error);
    return NextResponse.json(
      { error: 'Failed to update payment intent' },
      { status: 500 }
    );
  }
}

