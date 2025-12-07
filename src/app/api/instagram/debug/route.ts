// Debug endpoint to test Make.com webhook with real data
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInstagramImageUrl } from '@/lib/services/cloudinary-overlay';
import { generateCaption } from '@/lib/services/instagram-client';

export async function POST(request: NextRequest) {
  try {
    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Get webhook URL
    const webhookUrl = process.env.N8N_WEBHOOK_URL || process.env.ZAPIER_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N_WEBHOOK_URL not configured in .env.local' },
        { status: 500 }
      );
    }

    // Fetch product
    const supabase = await createClient();
    const { data: product, error } = await supabase
      .from('products')
      .select('id, description, price, primary_image_url, brand, model')
      .eq('id', productId)
      .single();

    if (error || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Generate title
    const title = product.brand && product.model
      ? `${product.brand} ${product.model}`
      : product.description.substring(0, 50);

    // Generate Instagram image
    const imageUrl = generateInstagramImageUrl({
      imageUrl: product.primary_image_url!,
      title,
      price: product.price,
    });

    // Generate caption
    const caption = generateCaption(title, product.price, product.description);

    // Prepare webhook payload
    const payload = {
      productId: product.id,
      title,
      price: product.price,
      URLIMAGE: imageUrl,
      caption,
      description: product.description,
    };

    console.log('=== DEBUG: Sending to n8n ===');
    console.log('Webhook URL:', webhookUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Send to Make.com
    const startTime = Date.now();
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const duration = Date.now() - startTime;

    // Get response
    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseData = { raw: responseText };
    }

    console.log('=== DEBUG: n8n Response ===');
    console.log('Status:', response.status);
    console.log('Duration:', duration, 'ms');
    console.log('Response:', responseData);

    return NextResponse.json({
      success: response.ok,
      webhook: {
        url: webhookUrl,
        method: 'POST',
        duration: `${duration}ms`,
      },
      request: {
        payload,
        payloadSize: JSON.stringify(payload).length,
        imageUrl,
        captionLength: caption.length,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseData,
      },
      validation: {
        hasURLIMAGE: !!payload.URLIMAGE,
        hasCaption: !!payload.caption,
        URLIMAGEStartsWith: payload.URLIMAGE?.substring(0, 50) || '',
        captionStartsWith: payload.caption?.substring(0, 100) || '',
      },
    });
  } catch (error) {
    console.error('[Debug] Error:', error);
    return NextResponse.json(
      { 
        error: 'Debug test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

