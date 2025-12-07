// ============================================================
// Instagram Image Generation API
// ============================================================
// Generates Cloudinary images with text overlays for Instagram

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInstagramImageUrl, isCloudinaryUrl, uploadToCloudinary } from '@/lib/services/cloudinary-overlay';

export async function POST(request: NextRequest) {
  try {
    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Fetch product from database
    const supabase = await createClient();
    const { data: product, error } = await supabase
      .from('products')
      .select('id, description, price, primary_image_url, brand, model')
      .eq('id', productId)
      .single();

    if (error || !product) {
      console.error('[Generate Image] Product not found:', error);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Validate primary image exists
    if (!product.primary_image_url) {
      return NextResponse.json(
        { error: 'Product has no primary image' },
        { status: 400 }
      );
    }

    // Generate title (prefer brand + model, fallback to description)
    const title = product.brand && product.model
      ? `${product.brand} ${product.model}`
      : product.description.substring(0, 50);

    console.log('[Generate Image] Processing product:', {
      id: product.id,
      title,
      price: product.price,
      imageUrl: product.primary_image_url,
    });

    // Handle non-Cloudinary images by fetching through Cloudinary
    let imageUrl = product.primary_image_url;
    if (!isCloudinaryUrl(imageUrl)) {
      console.log('[Generate Image] Non-Cloudinary image detected, fetching...');
      const fetchedUrl = await uploadToCloudinary(imageUrl);
      if (fetchedUrl) {
        imageUrl = fetchedUrl;
      } else {
        return NextResponse.json(
          { error: 'Failed to process image' },
          { status: 500 }
        );
      }
    }

    // Generate Instagram image with overlays
    const instagramImageUrl = generateInstagramImageUrl({
      imageUrl,
      title,
      price: product.price,
    });

    console.log('[Generate Image] Success:', instagramImageUrl);

    return NextResponse.json({
      success: true,
      imageUrl: instagramImageUrl,
      productDetails: {
        id: product.id,
        title,
        price: product.price,
        description: product.description,
      },
    });
  } catch (error) {
    console.error('[Generate Image] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate Instagram image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

