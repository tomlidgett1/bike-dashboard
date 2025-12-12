// ============================================================
// Stripe Checkout Session Creation API
// ============================================================
// POST: Creates a Stripe Checkout Session for product purchase

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, calculatePlatformFee, calculateSellerPayout } from '@/lib/stripe';

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
    const { productId } = body;

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

    // Calculate totals
    const itemPrice = product.price;
    const shippingCost = product.shipping_available ? (product.shipping_cost || 0) : 0;
    const totalAmount = itemPrice + shippingCost;

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
              description: `Purchase from Yellow Jersey Marketplace`,
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
      ],
      metadata: {
        product_id: product.id,
        buyer_id: user.id,
        seller_id: product.user_id,
        item_price: itemPrice.toString(),
        shipping_cost: shippingCost.toString(),
        total_amount: totalAmount.toString(),
        platform_fee: calculatePlatformFee(totalAmount).toString(),
        seller_payout: calculateSellerPayout(totalAmount).toString(),
      },
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
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error) {
    console.error('[Stripe Checkout] Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
