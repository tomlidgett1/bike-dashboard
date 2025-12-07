// Get a sample product ID for testing
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: products, error } = await supabase
      .from('products')
      .select('id, description, price, primary_image_url, brand, model')
      .eq('is_active', true)
      .not('primary_image_url', 'is', null)
      .limit(5);

    if (error || !products || products.length === 0) {
      return NextResponse.json(
        { error: 'No products found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      products: products.map(p => ({
        id: p.id,
        title: p.brand && p.model ? `${p.brand} ${p.model}` : p.description.substring(0, 50),
        price: p.price,
        hasImage: !!p.primary_image_url,
      })),
      instructions: {
        step1: 'Copy a product ID from above',
        step2: 'Use it to test: POST /api/instagram/debug with {"productId": "PASTE_ID_HERE"}',
      },
    });
  } catch (error) {
    console.error('[Get Product] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get products' },
      { status: 500 }
    );
  }
}

