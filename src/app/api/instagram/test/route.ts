// Test endpoint to verify Instagram posting flow without Make.com
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInstagramImageUrl } from '@/lib/services/cloudinary-overlay';
import { generateCaption } from '@/lib/services/instagram-client';

export async function GET(request: NextRequest) {
  try {
    // Get a sample product
    const supabase = await createClient();
    const { data: product, error } = await supabase
      .from('products')
      .select('id, description, price, primary_image_url, brand, model')
      .eq('is_active', true)
      .not('primary_image_url', 'is', null)
      .limit(1)
      .single();

    if (error || !product) {
      return NextResponse.json(
        { error: 'No products found for testing' },
        { status: 404 }
      );
    }

    // Generate title
    const title = product.brand && product.model
      ? `${product.brand} ${product.model}`
      : product.description.substring(0, 50);

    // Generate Instagram image
    const imageUrl = generateInstagramImageUrl({
      imageUrl: product.primary_image_url,
      title,
      price: product.price,
    });

    // Generate caption
    const caption = generateCaption(title, product.price, product.description);

    // Prepare webhook payload (what would be sent to Make.com)
    const webhookPayload = {
      productId: product.id,
      title,
      price: product.price,
      imageUrl,
      caption,
      description: product.description,
    };

    return NextResponse.json({
      success: true,
      message: 'Test data generated successfully!',
      product: {
        id: product.id,
        title,
        price: product.price,
      },
      generatedImageUrl: imageUrl,
      caption,
      webhookPayload,
      instructions: {
        step1: 'Copy the "generatedImageUrl" above',
        step2: 'Open it in a new browser tab',
        step3: 'You should see the product image with yellow text overlays!',
        step4: 'The webhook payload shows what would be sent to Make.com',
      },
    });
  } catch (error) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      { 
        error: 'Test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

