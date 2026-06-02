// ============================================================
// SMS Order Confirmation API
// ============================================================
// Sends order confirmation SMS for Uber Express deliveries
// Called from the checkout success page
// Supports both PaymentIntent (embedded) and Checkout Session (redirect)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import {
  createUberOrderTripLink,
  getUberNotificationPhones,
  type UberSellerProfile,
} from '@/lib/uber-delivery';

// SMS Broadcast Configuration
const SMS_API_URL = 'https://api.smsbroadcast.com.au/api.php';
const SMS_USERNAME = process.env.SMS_BROADCAST_USERNAME || 'accounts@ashburtoncycles.com.au';
const SMS_PASSWORD = process.env.SMS_BROADCAST_PASSWORD || 'Ashburton1';
const SMS_FROM = process.env.SMS_BROADCAST_FROM || 'AshyCycles';

interface SmsProductRow {
  id: string;
  display_name?: string | null;
  description?: string | null;
  user_id: string;
}

function cleanSmsPhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^\+61/, '0');
}

async function sendSms(to: string, message: string): Promise<{ phone: string; result: string; success: boolean }> {
  const params = new URLSearchParams({
    username: SMS_USERNAME,
    password: SMS_PASSWORD,
    from: SMS_FROM,
    to,
    message,
  });

  const response = await fetch(`${SMS_API_URL}?${params.toString()}`);
  const result = await response.text();
  return {
    phone: to,
    result,
    success: result.includes('Your message was sent'),
  };
}

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
    let productIds: string[] = [];
    let sellerId: string | undefined;
    let shippingPhone: string | undefined;
    let customerName: string | undefined;
    let shippingAddress: string | undefined;

    // Handle Stripe Checkout Session (mobile redirect flow)
    if (sessionId) {
      console.log('[SMS Order] Retrieving Checkout Session:', sessionId);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      deliveryMethod = session.metadata?.delivery_method;
      sellerId = session.metadata?.seller_id;
      productIds = session.metadata?.product_ids
        ? session.metadata.product_ids.split(',').filter(Boolean)
        : session.metadata?.product_id
          ? [session.metadata.product_id]
          : [];
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
        productIds,
        sellerId,
      });
    } 
    // Handle PaymentIntent (embedded checkout flow)
    else if (paymentIntentId) {
      console.log('[SMS Order] Retrieving PaymentIntent:', paymentIntentId);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      deliveryMethod = paymentIntent.metadata?.delivery_method;
      sellerId = paymentIntent.metadata?.seller_id;
      productIds = paymentIntent.metadata?.product_id ? [paymentIntent.metadata.product_id] : [];
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
        productIds,
        sellerId,
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

    const { data: products } = productIds.length > 0
      ? await supabase
          .from('products')
          .select('id, display_name, description, user_id')
          .in('id', productIds)
      : { data: [] as SmsProductRow[] };

    if (!sellerId && products && products.length > 0) {
      sellerId = products[0].user_id;
    }

    const { data: seller } = sellerId
      ? await supabase
          .from('users')
          .select('user_id, business_name, account_type, bicycle_store, address, phone, uber_notification_phones')
          .eq('user_id', sellerId)
          .maybeSingle()
      : { data: null };

    const sellerProfile = seller as UberSellerProfile | null;
    const storeName = sellerProfile?.business_name || 'your bike store';
    const storeAddress = sellerProfile?.address?.trim() || null;
    const productNames = (products || [])
      .map((product: SmsProductRow) => product.display_name || product.description)
      .filter(Boolean);
    const productName =
      productNames.length === 0
        ? 'your item'
        : productNames.length === 1
          ? productNames[0]
          : `${productNames.length} items`;
    const uberTripLinkPromise = createUberOrderTripLink({
      pickupAddress: storeAddress,
      pickupName: storeName,
      dropoffAddress: shippingAddress,
      dropoffName: customerName || 'Customer delivery',
    });

    // Send SMS to customer
    const cleanPhone = cleanSmsPhone(shippingPhone);
    const customerMessage = `Order confirmed! Your item from ${storeName} is on its way. Uber tracking link coming soon. Thanks for your order!`;
    console.log('[SMS Order] Sending customer SMS to:', cleanPhone);

    const customerSms = await sendSms(cleanPhone, customerMessage.substring(0, 160));

    console.log('[SMS Order] Customer SMS result:', customerSms.result);

    const customerSuccess = customerSms.success;
    const storePhones = getUberNotificationPhones(sellerProfile).map(cleanSmsPhone);
    const uberTripLink = await uberTripLinkPromise;

    if (!uberTripLink) {
      console.warn('[SMS Order] Uber trip link unavailable', {
        hasStoreAddress: !!storeAddress,
        hasShippingAddress: !!shippingAddress,
      });
    }
    
    // Build detailed store message with customer info
    const storeMessageParts = [
      `UBER ORDER`,
      `Customer: ${customerName || 'Unknown'}`,
      `Product: ${productName}`,
      `Pickup: ${storeAddress ? `${storeName}, ${storeAddress}` : storeName}`,
      `Dropoff: ${shippingAddress || 'Not provided'}`,
      `Phone: ${cleanPhone}`,
      ...(uberTripLink ? [`Book Uber: ${uberTripLink}`] : []),
    ];
    const storeMessage = storeMessageParts.join('\n');

    console.log('[SMS Order] Sending store notification SMS to:', storePhones);

    const storeResults = await Promise.all(
      storePhones.map((storePhone) => sendSms(storePhone, storeMessage))
    );

    console.log('[SMS Order] Store SMS result:', storeResults);

    const storeSuccess = storeResults.length > 0 && storeResults.every((result) => result.success);

    return NextResponse.json({
      success: customerSuccess,
      storeNotified: storeSuccess,
      message: customerSuccess ? 'SMS sent successfully' : customerSms.result,
      debug: {
        phone: cleanPhone,
        storePhones,
        productName,
        uberTripLink,
        deliveryMethod,
        customerResult: customerSms.result,
        storeResults,
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
