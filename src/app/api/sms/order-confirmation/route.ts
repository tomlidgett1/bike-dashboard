// ============================================================
// SMS Order Confirmation API
// ============================================================
// Sends order confirmation SMS for Uber Express deliveries
// Called from the checkout success page
// Supports both PaymentIntent (embedded) and Checkout Session (redirect)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

// SMS Broadcast Configuration
const SMS_API_URL = 'https://api.smsbroadcast.com.au/api.php';
const SMS_USERNAME = 'accounts@ashburtoncycles.com.au';
const SMS_PASSWORD = 'Ashburton1';
const SMS_FROM = 'AshyCycles';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const stripe = getStripe();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { paymentIntentId, sessionId, phone: phoneFromUrl } = await request.json();

    if (!paymentIntentId && !sessionId) {
      return NextResponse.json({ error: 'Missing paymentIntentId or sessionId' }, { status: 400 });
    }

    let deliveryMethod: string | undefined;
    let productId: string | undefined;
    let shippingPhone: string | undefined;
    let customerName: string | undefined;
    let shippingAddress: string | undefined;

    // Handle Stripe Checkout Session (mobile redirect flow)
    if (sessionId) {
      console.log('[SMS Order] Retrieving Checkout Session:', sessionId);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      deliveryMethod = session.metadata?.delivery_method;
      productId = session.metadata?.product_id;
      // Phone from checkout session customer_details
      shippingPhone = session.customer_details?.phone || phoneFromUrl;
      customerName = session.customer_details?.name || 'Unknown';
      
      // Build shipping address from session customer_details
      const addr = session.customer_details?.address;
      if (addr) {
        const parts = [
          addr.line1,
          addr.line2,
          addr.city,
          addr.state,
          addr.postal_code,
        ].filter(Boolean);
        shippingAddress = parts.join(', ');
      }

      console.log('[SMS Order] Checkout Session:', {
        id: sessionId,
        deliveryMethod,
        sessionPhone: session.customer_details?.phone,
        urlPhone: phoneFromUrl,
        finalPhone: shippingPhone,
        customerName,
        shippingAddress,
        productId,
      });
    } 
    // Handle PaymentIntent (embedded checkout flow)
    else if (paymentIntentId) {
      console.log('[SMS Order] Retrieving PaymentIntent:', paymentIntentId);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      deliveryMethod = paymentIntent.metadata?.delivery_method;
      productId = paymentIntent.metadata?.product_id;
      shippingPhone = paymentIntent.shipping?.phone || phoneFromUrl;
      customerName = paymentIntent.shipping?.name || 'Unknown';
      
      // Build shipping address from payment intent
      const addr = paymentIntent.shipping?.address;
      if (addr) {
        const parts = [
          addr.line1,
          addr.line2,
          addr.city,
          addr.state,
          addr.postal_code,
        ].filter(Boolean);
        shippingAddress = parts.join(', ');
      }

      console.log('[SMS Order] PaymentIntent:', {
        id: paymentIntentId,
        deliveryMethod,
        stripePhone: paymentIntent.shipping?.phone,
        urlPhone: phoneFromUrl,
        finalPhone: shippingPhone,
        customerName,
        shippingAddress,
        productId,
      });
    }

    // Only send for Uber Express
    if (deliveryMethod !== 'uber_express') {
      return NextResponse.json({ 
        success: false, 
        reason: 'Not Uber Express delivery' 
      });
    }

    if (!shippingPhone) {
      return NextResponse.json({ 
        success: false, 
        reason: 'No phone number provided' 
      });
    }

    // Get product name
    const { data: product } = await supabase
      .from('products')
      .select('display_name, description')
      .eq('id', productId)
      .single();

    const productName = product?.display_name || product?.description || 'your item';

    // Send SMS to customer
    const cleanPhone = shippingPhone.replace(/\s+/g, '').replace(/^\+61/, '0');
    const customerMessage = `Order confirmed! Your item from Ashburton Cycles is on its way. Uber tracking link coming soon. Thanks for your order!`;

    const customerParams = new URLSearchParams({
      username: SMS_USERNAME,
      password: SMS_PASSWORD,
      from: SMS_FROM,
      to: cleanPhone,
      message: customerMessage.substring(0, 160),
    });

    const customerUrl = `${SMS_API_URL}?${customerParams.toString()}`;
    console.log('[SMS Order] Sending customer SMS to:', cleanPhone);

    const customerResponse = await fetch(customerUrl);
    const customerResult = await customerResponse.text();

    console.log('[SMS Order] Customer SMS result:', customerResult);

    const customerSuccess = customerResult.includes('Your message was sent');

    // Send notification SMS to store (0414187820)
    const storePhone = '0414187820';
    
    // Build detailed store message with customer info
    const storeMessageParts = [
      `UBER ORDER`,
      `Customer: ${customerName || 'Unknown'}`,
      `Product: ${productName}`,
      `Address: ${shippingAddress || 'Not provided'}`,
      `Phone: ${cleanPhone}`,
    ];
    const storeMessage = storeMessageParts.join('\n');

    const storeParams = new URLSearchParams({
      username: SMS_USERNAME,
      password: SMS_PASSWORD,
      from: SMS_FROM,
      to: storePhone,
      message: storeMessage.substring(0, 320), // Allow longer SMS (2 segments)
    });

    const storeUrl = `${SMS_API_URL}?${storeParams.toString()}`;
    console.log('[SMS Order] Sending store notification SMS to:', storePhone);

    const storeResponse = await fetch(storeUrl);
    const storeResult = await storeResponse.text();

    console.log('[SMS Order] Store SMS result:', storeResult);

    const storeSuccess = storeResult.includes('Your message was sent');

    return NextResponse.json({
      success: customerSuccess,
      storeNotified: storeSuccess,
      message: customerSuccess ? 'SMS sent successfully' : customerResult,
      debug: {
        apiUrl: customerUrl,
        phone: cleanPhone,
        productName,
        deliveryMethod,
        customerResult,
        storeResult,
      },
    });

  } catch (error) {
    console.error('[SMS Order] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}

