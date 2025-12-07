// Simple endpoint to show what fields Zapier receives
import { NextResponse } from 'next/server';

export async function GET() {
  const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
  
  if (!webhookUrl) {
    return NextResponse.json({
      error: 'ZAPIER_WEBHOOK_URL not configured',
      instructions: 'Add ZAPIER_WEBHOOK_URL to your .env.local file'
    }, { status: 500 });
  }

  const testPayload = {
    productId: 'test-product-123',
    title: 'Mountain Bike',
    price: 1299.00,
    URLIMAGE: 'https://res.cloudinary.com/dydrzocpt/image/upload/v1764758635/bike-marketplace/listings/1182b0ff-67f2-451f-94c8-19dfdf574459/smart-1764758631780/1764758634-0.jpg',
    caption: 'Mountain Bike / $1,299.00 - live now on Yellow Jersey 🚴‍♂️'
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    const result = await response.text();

    return NextResponse.json({
      success: true,
      message: 'Test data sent to Zapier!',
      zapierWebhookUrl: webhookUrl,
      sentData: testPayload,
      zapierResponse: result ? JSON.parse(result) : {},
      nextSteps: {
        step1: 'Go to https://zapier.com/app/history',
        step2: 'Find the most recent webhook trigger',
        step3: 'You should see these fields:',
        fields: Object.keys(testPayload),
        step4: 'In your Zap action, map "1. URLIMAGE" to Instagram Photo URL',
        step5: 'Map "1. caption" to Instagram Caption'
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to send to Zapier',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

