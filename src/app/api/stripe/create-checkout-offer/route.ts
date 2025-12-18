// ============================================================
// Stripe Checkout Session Creation API - OFFER PAYMENT
// ============================================================
// POST: Creates a Stripe Checkout Session for paying an accepted offer

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, calculatePlatformFee, calculateSellerPayout, calculateBuyerFee } from '@/lib/stripe';

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
        { error: 'Unauthorised - please sign in to complete payment' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { offerId } = body;

    if (!offerId) {
      return NextResponse.json(
        { error: 'Offer ID is required' },
        { status: 400 }
      );
    }

    // Fetch offer details
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (offerError || !offer) {
      console.error('[Stripe Offer Checkout] Offer fetch error:', offerError);
      return NextResponse.json(
        { error: 'Offer not found' },
        { status: 404 }
      );
    }

    // Validate that the current user is the buyer
    if (offer.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only pay for your own offers' },
        { status: 403 }
      );
    }

    // Validate offer status
    if (offer.status !== 'accepted') {
      return NextResponse.json(
        { error: 'Only accepted offers can be paid' },
        { status: 400 }
      );
    }

    // Check if already paid
    if (offer.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'This offer has already been paid' },
        { status: 400 }
      );
    }

    // Check if payment deadline has passed
    if (offer.payment_deadline && new Date(offer.payment_deadline) < new Date()) {
      return NextResponse.json(
        { error: 'Payment deadline has passed. Please contact the seller.' },
        { status: 400 }
      );
    }

    // Fetch product details
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
      .eq('id', offer.product_id)
      .single();

    if (productError || !product) {
      console.error('[Stripe Offer Checkout] Product fetch error:', productError);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Validate product is still available
    if (product.sold_at || product.listing_status === 'sold') {
      return NextResponse.json(
        { error: 'This product has already been sold' },
        { status: 400 }
      );
    }

    // Fetch product image from product_images table
    const { data: productImages } = await supabase
      .from('product_images')
      .select('cloudinary_url, card_url, detail_url, is_primary')
      .eq('product_id', offer.product_id)
      .eq('approval_status', 'approved')
      .order('is_primary', { ascending: false })
      .limit(1);

    const primaryImage = productImages?.[0];

    // Calculate totals using OFFER AMOUNT instead of product price
    const itemPrice = parseFloat(offer.offer_amount);
    const shippingCost = product.shipping_available ? (product.shipping_cost || 0) : 0;
    const buyerFee = calculateBuyerFee(itemPrice); // 0.5% buyer service fee
    const totalAmount = itemPrice + shippingCost + buyerFee;

    // Calculate savings for display
    const savings = parseFloat(offer.original_price) - itemPrice;
    const savingsPercentage = ((savings / parseFloat(offer.original_price)) * 100).toFixed(0);

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

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: {
              name: product.display_name || product.description,
              description: `Accepted Offer - ${savingsPercentage}% off original price`,
              ...(productImage && { images: [productImage] }),
            },
            unit_amount: Math.round(itemPrice * 100), // Stripe uses cents
          },
          quantity: 1,
        },
        // Add shipping as a separate line item if applicable
        ...(shippingCost > 0 ? [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Shipping',
              description: 'Delivery cost',
            },
            unit_amount: Math.round(shippingCost * 100),
          },
          quantity: 1,
        }] : []),
        // Buyer service fee (0.5%)
        ...(buyerFee > 0 ? [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Service Fee',
              description: 'Yellow Jersey marketplace fee',
            },
            unit_amount: Math.round(buyerFee * 100),
          },
          quantity: 1,
        }] : []),
      ],
      // Collect shipping address from buyer
      shipping_address_collection: {
        allowed_countries: ['AU', 'NZ'], // Australia and New Zealand
      },
      // Collect phone number for delivery
      phone_number_collection: {
        enabled: true,
      },
      metadata: {
        // Flag this as an offer payment
        offer_id: offer.id,
        product_id: product.id,
        buyer_id: user.id,
        seller_id: product.user_id,
        item_price: itemPrice.toString(),
        original_price: offer.original_price.toString(),
        shipping_cost: shippingCost.toString(),
        buyer_fee: buyerFee.toString(),
        total_amount: totalAmount.toString(),
        platform_fee: calculatePlatformFee(itemPrice).toString(), // 3% of offer price (seller pays)
        seller_payout: calculateSellerPayout(itemPrice).toString(), // Offer price minus platform fee
        savings: savings.toString(),
        savings_percentage: savingsPercentage,
        payment_type: 'offer', // Flag to distinguish in webhook
      },
      success_url: `${appUrl}/marketplace/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/messages?tab=offers&offer_id=${offerId}`,
      customer_email: user.email,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
    });

    if (!session.url) {
      console.error('[Stripe Offer Checkout] No session URL returned');
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    // Update offer with stripe session ID
    await supabase
      .from('offers')
      .update({ stripe_session_id: session.id })
      .eq('id', offerId);

    console.log('[Stripe Offer Checkout] Session created:', {
      sessionId: session.id,
      offerId: offer.id,
      productId: product.id,
      buyerId: user.id,
      offerAmount: itemPrice,
      originalPrice: offer.original_price,
      savings: savings,
      total: totalAmount,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error) {
    console.error('[Stripe Offer Checkout] Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

