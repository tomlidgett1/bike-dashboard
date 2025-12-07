// Generate simple square image without text overlays (for testing)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

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

    if (!product.primary_image_url) {
      return NextResponse.json(
        { error: 'Product has no primary image' },
        { status: 400 }
      );
    }

    // Extract cloud name
    const cloudNameMatch = product.primary_image_url.match(/cloudinary\.com\/([^\/]+)\//);
    const cloudName = cloudNameMatch ? cloudNameMatch[1] : 'dydrzocpt';

    // Extract public ID
    const urlObj = new URL(product.primary_image_url);
    const pathname = urlObj.pathname;
    const uploadIndex = pathname.indexOf('/upload/');
    const publicId = pathname.substring(uploadIndex + 8);

    // Simple square crop only - NO TEXT OVERLAYS
    const simpleUrl = `https://res.cloudinary.com/${cloudName}/image/upload/w_1080,h_1080,c_fill/${publicId}`;

    // Generate title and caption
    const title = product.brand && product.model
      ? `${product.brand} ${product.model}`
      : product.description.substring(0, 50);

    const caption = `${title} / $${product.price.toFixed(2)} - live now on Yellow Jersey 🚴‍♂️`;

    return NextResponse.json({
      success: true,
      imageUrl: simpleUrl,
      caption,
      note: 'This is a simple square-cropped image WITHOUT text overlays - for testing if Zapier accepts it',
      productDetails: {
        id: product.id,
        title,
        price: product.price,
      },
    });
  } catch (error) {
    console.error('[Simple Image] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

