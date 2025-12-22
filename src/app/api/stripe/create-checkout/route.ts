// ============================================================
// Stripe Checkout Session Creation API
// ============================================================
// POST: Creates a Stripe Checkout Session for product purchase
// Supports delivery method selection (Uber Express, AusPost, Pickup)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, calculatePlatformFee, calculateSellerPayout, calculateBuyerFee } from '@/lib/stripe';

// Delivery fees (same as payment-intent)
const UBER_EXPRESS_FEE = 15;
const AUSPOST_FEE = 12;

export type DeliveryMethod = 'uber_express' | 'auspost' | 'pickup' | 'shipping';

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

    const body = await request.json();
    const { productId, deliveryMethod = 'uber_express' } = body as { productId: string; deliveryMethod?: DeliveryMethod };

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
        images,
        user_id,
        is_active,
        sold_at,
        listing_status
      `)
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('[Stripe Checkout] Product fetch error:', productError);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Fetch product image from product_images table
    const { data: productImages } = await supabase
      .from('product_images')
      .select('cloudinary_url, card_url, detail_url, is_primary')
      .eq('product_id', productId)
      .eq('approval_status', 'approved')
      .order('is_primary', { ascending: false })
      .limit(1);

    const primaryImage = productImages?.[0];

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
        console.log('[Stripe Checkout] Applying voucher:', {
          voucherId: voucher.id,
          type: voucher.voucher_type,
          discount: voucherDiscount,
        });
      }
    }

    // Calculate final totals (with voucher discount)
    const totalBeforeDiscount = itemPrice + deliveryCost + buyerFee;
    const totalAmount = Math.max(0, totalBeforeDiscount - voucherDiscount);

    // Adjusted item price (apply voucher discount to the item, not delivery/fees)
    const adjustedItemPrice = Math.max(0, itemPrice - voucherDiscount);
    const adjustedItemPriceCents = Math.round(adjustedItemPrice * 100);

    // Get product image for Stripe checkout display
    let productImage: string | undefined;
    
    // Priority 1: Image from product_images table
    if (primaryImage) {
      productImage = primaryImage.detail_url || primaryImage.cloudinary_url || primaryImage.card_url;
    }
    // Priority 2: Legacy JSONB images
    else if (Array.isArray(product.images) && product.images.length > 0) {
      const firstImage = product.images[0];
      productImage = typeof firstImage === 'string' ? firstImage : firstImage?.url;
    }

    // Validate image URL (Stripe requires HTTPS)
    if (productImage && !productImage.startsWith('https://')) {
      productImage = undefined;
    }

    // Get app URL for success/cancel redirects
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Determine if we need to collect shipping address (not for pickup)
    const requiresShipping = deliveryMethod !== 'pickup';

    // Build line items
    const lineItems: any[] = [
      {
        price_data: {
          currency: 'aud',
          product_data: {
            name: product.display_name || product.description,
            description: applicableVoucher 
              ? `Purchase from Yellow Jersey Marketplace (includes $${voucherDiscount.toFixed(2)} discount)`
              : 'Purchase from Yellow Jersey Marketplace',
            ...(productImage && { images: [productImage] }),
          },
          unit_amount: adjustedItemPriceCents, // Use adjusted price with voucher applied
        },
        quantity: 1,
      },
    ];

    // Add delivery as a separate line item if applicable
    if (deliveryCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'aud',
          product_data: {
            name: deliveryDescription,
            description: 'Delivery cost',
          },
          unit_amount: Math.round(deliveryCost * 100),
        },
        quantity: 1,
      });
    }

    // Buyer service fee (0.5%)
    if (buyerFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'aud',
          product_data: {
            name: 'Service Fee',
            description: 'Yellow Jersey marketplace fee',
          },
          unit_amount: Math.round(buyerFee * 100),
        },
        quantity: 1,
      });
    }

    // Build metadata with voucher info
    const metadata: Record<string, string> = {
      product_id: product.id,
      buyer_id: user.id,
      seller_id: product.user_id,
      item_price: itemPrice.toString(), // Original item price
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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      // Only collect shipping address if not pickup
      ...(requiresShipping && {
        shipping_address_collection: {
          allowed_countries: ['AU', 'NZ'], // Australia and New Zealand
        },
      }),
      // Collect phone number for delivery
      phone_number_collection: {
        enabled: true,
      },
      metadata,
      success_url: `${appUrl}/marketplace/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/marketplace/checkout/cancel?product_id=${productId}`,
      customer_email: user.email,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
    });

    if (!session.url) {
      console.error('[Stripe Checkout] No session URL returned');
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    console.log('[Stripe Checkout] Session created:', {
      sessionId: session.id,
      productId: product.id,
      buyerId: user.id,
      total: totalAmount,
      voucherApplied: !!applicableVoucher,
      voucherDiscount: voucherDiscount,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      voucher: applicableVoucher ? {
        id: applicableVoucher.id,
        discount: voucherDiscount,
        description: applicableVoucher.description,
      } : null,
    });

  } catch (error) {
    console.error('[Stripe Checkout] Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

