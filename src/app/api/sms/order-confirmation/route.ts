// ============================================================
// SMS Order Confirmation API
// ============================================================
// Sends order confirmation SMS for Uber Express deliveries
// Called from the checkout success page

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

    const { paymentIntentId, phone: phoneFromUrl } = await request.json();

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'Missing paymentIntentId' }, { status: 400 });
    }

    // Get PaymentIntent from Stripe to get shipping phone and metadata
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    const deliveryMethod = paymentIntent.metadata?.delivery_method;
    const productId = paymentIntent.metadata?.product_id;
    
    // Try to get phone from: 1) Stripe shipping, 2) URL param
    const shippingPhone = paymentIntent.shipping?.phone || phoneFromUrl;

    console.log('[SMS Order] PaymentIntent:', {
      id: paymentIntentId,
      deliveryMethod,
      stripePhone: paymentIntent.shipping?.phone,
      urlPhone: phoneFromUrl,
      finalPhone: shippingPhone,
      productId,
    });

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

    // Send SMS
    const cleanPhone = shippingPhone.replace(/\s+/g, '').replace(/^\+61/, '0');
    const message = `Order confirmed! Your item from Ashburton Cycles is on its way. Uber tracking link coming soon. Thanks for your order!`;

    const params = new URLSearchParams({
      username: SMS_USERNAME,
      password: SMS_PASSWORD,
      from: SMS_FROM,
      to: cleanPhone,
      message: message.substring(0, 160),
    });

    const fullUrl = `${SMS_API_URL}?${params.toString()}`;
    console.log('[SMS Order] Full API URL:', fullUrl);
    console.log('[SMS Order] Sending to:', cleanPhone);

    const smsResponse = await fetch(fullUrl);
    const smsResult = await smsResponse.text();

    console.log('[SMS Order] Result:', smsResult);

    const success = smsResult.includes('Your message was sent');

    return NextResponse.json({
      success,
      message: success ? 'SMS sent successfully' : smsResult,
      debug: {
        apiUrl: fullUrl,
        phone: cleanPhone,
        productName,
        deliveryMethod,
        result: smsResult,
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

